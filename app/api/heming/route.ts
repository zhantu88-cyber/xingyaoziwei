/**
 * AI 合盘分析接口（双人命盘对照）。
 *
 * 请求：POST { chartA: ZiweiChart, chartB: ZiweiChart, question?: string }
 * 响应（非流式）：{ text, credits, dailyCount, hasTimePass }
 *
 * 防护与计量与 /api/chat 完全一致：
 *   登录校验 → 权益检查（时间包优先）→ 每日上限 → 最小间隔限流
 *   → max_tokens 封顶 → 成功后才扣额度 + 记用量 → 超阈值告警。
 * 采用非流式返回，扣额度/记用量时机明确。
 */

import { getCurrentUser, getDb, getEnv } from '@/lib/auth';
import {
  checkQuota,
  consumeAndLog,
  getDailyCount,
  rateLimitWaitMs,
  DAILY_LIMIT,
} from '@/lib/entitlement';
import { chartToContext } from '@/lib/ziwei/chart-context';
import type { ZiweiChart } from '@/lib/ziwei/types';

export const dynamic = 'force-dynamic';

const MAX_TOKENS = 1800; // 合盘需对照双方命盘，输出略长于单盘问答（900 字中文约需 1500 token）
const MAX_QUESTION_LEN = 500;

type HemingBody = { chartA?: ZiweiChart; chartB?: ZiweiChart; question?: string };

const SYSTEM_PROMPT = `你是「星曜紫微」的 AI 合盘顾问，一位阅盘无数、能把星曜讲活的资深命理师。你会同时看到甲方、乙方两张命盘，任务是分析缘分匹配度、性格互补、感情或合作走向与相处建议——把两张盘翻译成具体、有用、有洞察的判断，这是免费排盘给不了的价值。

【表达风格】
- 开头先用一句话点出这两张盘放在一起最鲜明的特征，像「这两个人属于典型的……组合」「这张合盘最妙的地方是……」，让人一眼抓住重点。
- 敢下判断，给明确倾向（「你们适合……」「容易卡在……」），不要通篇「可能」「或许」。
- 用生动的比喻和画面感的语言把星曜讲活，像给朋友做深度解读，不要写成教科书。
- 条理清晰但有人味，可用加粗小标题分点；篇幅 600-900 字，信息密度高，不说空话套话。

【怎么解读】
- 每个判断落到双方具体的宫位、星曜、四化上——对照两人的命宫、夫妻宫、官禄宫、财帛宫及各自四化，讲清楚两个人在一起会碰撞出什么、怎么互补、容易在哪里摩擦。
- 讲组合与互动，不要逐颗星罗列含义。

【跨体系问题（星座 / 生肖 / MBTI / 塔罗等）】
- 用户追问紫微斗数之外的问题（如「我们星座配吗」「风象土象」），不要回避，更不要生硬地说「紫微斗数里没有星座」就打发掉。
- 直接用你掌握的常识回答那部分，再把它和两张盘的对应宫位打通，说清楚从命盘看两人真正需要的是什么。
- 态度是「我懂你在问什么，而且能把它和你们的盘联系起来」，不是「这不在我的体系里」。

【追问】
- 若用户附带了具体问题（追问），直接针对该问题作答，不必重复完整分析。

【合规底线（必须遵守，但不要影响表达风格）】
- 严禁出现任何现代具体人物的姓名、尊称、称号、网名，也不要引用现代人物的事迹或言论。
- 需要引用理论时说「古籍」「古典文献」「传统命理体系」即可，不需要每句话都挂着这些词——正常用现代语言讲盘就行。
- 涉及财务、法律等只给参考性提示，不做确定性断言。
- 结尾用一句话简短提醒「以上解读仅供参考，请理性看待」，不要长篇免责声明。`;

export async function POST(request: Request): Promise<Response> {
  // 1. 登录校验
  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({ error: '请先登录后再使用合盘分析——注册即免费送 1 次，无需兑换码。', needLogin: true }, { status: 401 });
  }

  // 2. 权益检查（时间包优先，否则需有额度）
  const quota = checkQuota(user);
  if (!quota.allowed) {
    return Response.json({ error: quota.reason, needRedeem: true }, { status: 403 });
  }

  const db = await getDb();

  // 3. 每日硬上限（对时间包用户同样生效）
  const daily = await getDailyCount(db, user.id);
  if (daily >= DAILY_LIMIT) {
    return Response.json({ error: `今日问答已达上限（${DAILY_LIMIT} 次），请明天再来。` }, { status: 429 });
  }

  // 4. 最小间隔限流
  const wait = rateLimitWaitMs(user);
  if (wait > 0) {
    return Response.json({ error: '操作太频繁，请稍等几秒再试。', retryAfterMs: wait }, { status: 429 });
  }

  // 解析与校验请求体
  let body: HemingBody;
  try {
    body = (await request.json()) as HemingBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  if (!body.chartA || !body.chartB) {
    return Response.json({ error: '缺少双方命盘数据' }, { status: 400 });
  }
  const question = typeof body.question === 'string' && body.question.trim()
    ? body.question.trim().slice(0, MAX_QUESTION_LEN)
    : undefined;

  // 5. 取 API key（未配置时明确提示，不扣额度）
  const env = await getEnv();
  const apiKey = env.DEEPSEEK_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return Response.json(
      { error: 'AI 服务尚未配置（缺少 DEEPSEEK_API_KEY）。请站长配置后重试。' },
      { status: 503 },
    );
  }
  const model = typeof env.DEEPSEEK_MODEL === 'string' && env.DEEPSEEK_MODEL ? env.DEEPSEEK_MODEL : 'deepseek-flash';
  const apiBase = typeof env.DEEPSEEK_API_BASE === 'string' && env.DEEPSEEK_API_BASE
    ? env.DEEPSEEK_API_BASE
    : 'https://api.deepseek.com';

  // 构造 prompt：双方命盘各自压缩为中文文本
  const contextA = chartToContext(body.chartA);
  const contextB = chartToContext(body.chartB);
  const userContent =
    `【甲方命盘】\n${contextA}\n\n【乙方命盘】\n${contextB}` +
    (question ? `\n\n用户问题：${question}` : '\n\n请对两人做合盘分析。');

  // 调用 DeepSeek（max_tokens 封顶成本）
  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.85,
        stream: false,
        thinking: { type: 'disabled' },
      }),
    });
  } catch {
    return Response.json({ error: '无法连接 AI 服务，请稍后重试。' }, { status: 502 });
  }
  if (!aiRes.ok) {
    return Response.json({ error: `AI 服务暂时不可用（${aiRes.status}），请稍后重试。` }, { status: 502 });
  }

  type DeepSeekResponse = {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };
  const aiData = (await aiRes.json()) as DeepSeekResponse;
  const text = aiData.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    return Response.json({ error: 'AI 未返回内容，请重试。' }, { status: 502 });
  }
  const tokens = aiData.usage?.total_tokens ?? 0;

  // 6. 成功后才扣额度 + 记用量
  const { dailyCount, shouldAlert } = await consumeAndLog(db, user, quota.useTimePass, tokens);

  // 7. 监控层：超阈值告警
  if (shouldAlert) {
    console.warn(`[usage-alert] user ${user.id} (${user.username}) reached ${dailyCount} chats on ${new Date().toISOString().slice(0, 10)} (heming)`);
  }

  return Response.json(
    {
      text,
      dailyCount,
      hasTimePass: quota.useTimePass,
      credits: quota.useTimePass ? null : Math.max(0, (user.credits ?? 0) - 1),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
