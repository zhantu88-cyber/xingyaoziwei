/**
 * AI 命盘问答接口（四层防护全部落在这里）。
 *
 * 请求：POST { chart: ZiweiChart, messages: [{role, content}] }
 * 响应（非流式）：{ text, credits, dailyCount, hasTimePass }
 *
 * 防护顺序：
 *   1. 登录校验（账号层）
 *   2. 权益检查：时间包优先，否则需有额度（账号层）
 *   3. 每日硬上限 DAILY_LIMIT（成本层）
 *   4. 最小请求间隔限流（账号层）
 *   5. max_tokens 封顶单次输出（成本层）
 *   6. 成功后才扣额度 + 记用量（账号层 + 监控层）
 *   7. 超阈值告警（监控层）
 *
 * 说明：采用非流式返回——扣额度/记用量/告警的时机明确、不易出错。
 * max_tokens=1024 的回答 DeepSeek 通常数秒内返回，体验可接受，后续可平滑升级为流式。
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

const MAX_TOKENS = 1024; // 成本层：单次回答 token 上限，直接封顶成本
const MAX_HISTORY = 10; // 最多携带的历史消息条数，防 prompt 膨胀
const MAX_INPUT_LEN = 500; // 单条用户输入长度上限

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ChatBody = { chart?: ZiweiChart; messages?: ChatMessage[]; liunianYear?: number };

const SYSTEM_PROMPT = `你是一位精通传统紫微斗数（古典三合派）的命理师，根据用户提供的命盘解答问题。
要求：
- 紧扣命盘，结合宫位、星曜、四化、大限做具体分析，不空泛。
- 命盘中若附有【流年】信息（流年命宫、流年官禄/财帛/夫妻/迁移宫、流年四化），凡涉及"今年/明年/某某年"的问题，必须优先用该流年的宫位与四化来回答，并指明是该年的流年宫位，不要只泛泛谈大限。
- 语气温和专业、通俗易懂，条理清晰，篇幅控制在 500 字以内。
- 涉及健康、财务、法律等只给参考性提示，不做确定性断言。
- 结尾用一句话提醒"命理解读仅供参考，请理性看待"。
- 严禁在回答中出现任何具体现代人物姓名及其尊称（如"某师""老师"等），只引用古典文献与古籍名称，避免侵权。回答统一使用"古籍""古典文献""传统体系"等中性表述。`;

export async function POST(request: Request): Promise<Response> {
  // 1. 登录校验
  const user = await getCurrentUser(request);
  if (!user) {
    return Response.json({ error: '请先登录后再使用 AI 问答', needLogin: true }, { status: 401 });
  }

  // 2. 权益检查
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
    return Response.json({ error: '提问太频繁，请稍等几秒再试。', retryAfterMs: wait }, { status: 429 });
  }

  // 解析与校验请求体
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: '请求格式错误' }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser || typeof lastUser.content !== 'string' || !lastUser.content.trim()) {
    return Response.json({ error: '问题不能为空' }, { status: 400 });
  }
  if (!body.chart) {
    return Response.json({ error: '缺少命盘数据' }, { status: 400 });
  }

  // 5. 取 API key（未配置时给出明确提示，不扣额度）
  const env = await getEnv();
  const apiKey = env.DEEPSEEK_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    return Response.json(
      { error: 'AI 服务尚未配置（缺少 DEEPSEEK_API_KEY）。请站长配置后重试。' },
      { status: 503 },
    );
  }
  // 默认用 deepseek-flash（便宜快速）；可用 DEEPSEEK_MODEL secret 覆盖为 deepseek-v4-pro 等。
  const model = typeof env.DEEPSEEK_MODEL === 'string' && env.DEEPSEEK_MODEL ? env.DEEPSEEK_MODEL : 'deepseek-flash';
  const apiBase = typeof env.DEEPSEEK_API_BASE === 'string' && env.DEEPSEEK_API_BASE
    ? env.DEEPSEEK_API_BASE
    : 'https://api.deepseek.com';

  // 构造 prompt：命盘压缩为中文文本 + 有限历史
  // liunianYear 做合法性校验后传入，用于回答"明年/某年如何"这类时间相关问题。
  const lnYear =
    typeof body.liunianYear === 'number' && Number.isInteger(body.liunianYear) &&
    body.liunianYear >= 1900 && body.liunianYear <= 2200
      ? body.liunianYear
      : undefined;
  const chartContext = chartToContext(body.chart, lnYear);
  const history = messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_INPUT_LEN) }));

  const aiMessages = [
    {
      role: 'system',
      content:
        `${SYSTEM_PROMPT}\n\n当前公历年份：${new Date().getFullYear()} 年。` +
        `\n\n以下是用户的命盘：\n${chartContext}`,
    },
    ...history,
  ];

  // 调用 DeepSeek（max_tokens 封顶成本）
  let aiRes: globalThis.Response;
  try {
    aiRes = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: aiMessages,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        stream: false,
        // 新模型 thinking 默认开启，命盘解读不需要长推理，显式关闭以省钱提速。
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

  // 7. 监控层：超阈值告警（先记日志；如需邮件告警可在此接入邮件服务）
  if (shouldAlert) {
    console.warn(`[usage-alert] user ${user.id} (${user.username}) reached ${dailyCount} chats on ${new Date().toISOString().slice(0, 10)}`);
  }

  return Response.json(
    {
      text,
      dailyCount,
      hasTimePass: quota.useTimePass,
      // 时间包用户不扣额度，credits 返回 null 表示"本次未消耗"
      credits: quota.useTimePass ? null : Math.max(0, (user.credits ?? 0) - 1),
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
