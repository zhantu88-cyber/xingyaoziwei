'use client';
import { useState, useRef, useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart } from '@/lib/ziwei/types';

/** 把 AI 回答里的 **加粗** 渲染成 <strong>，避免原样显示星号。
 *  只做这一处白名单转换，不解析其它 Markdown，杜绝 XSS。 */
function renderRichText(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i} style={{ color: 'var(--ac)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  chart: ZiweiChart;
  /** 当前选中的流年年份；传入后 AI 能回答"明年/某年如何"这类时间相关问题 */
  liunianYear?: number;
}

const PRESET_QUESTIONS = [
  '我的整体命格如何？性格特点是什么？',
  '我的感情婚姻运势如何？',
  '我的事业财运如何？适合什么方向？',
  '我现在的大限运势如何？',
  '我的健康需要注意什么？',
  '今年的流年运势如何？',
];

export default function ChatPanel({ chart, liunianYear }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [hasTimePass, setHasTimePass] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 加载当前额度/权益（前端只读 /api/me，不用 localStorage）
  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { authenticated?: boolean; user?: { credits?: number; hasTimePass?: boolean } | null }) => {
        if (d.authenticated && d.user) {
          setCredits(d.user.credits ?? 0);
          setHasTimePass(!!d.user.hasTimePass);
        }
      })
      .catch(() => { /* 未登录或网络错误时忽略 */ });
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    // 追加一条占位的助手消息，loading 时显示光标
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: [...messages, userMsg], liunianYear }),
      });

      const data = await res.json().catch(() => ({})) as {
        text?: string; error?: string; needLogin?: boolean; needRedeem?: boolean;
        credits?: number | null; dailyCount?: number;
      };

      if (!res.ok) {
        let msg = data.error ?? '解读失败，请稍后重试。';
        if (data.needLogin) msg = '请先登录后再使用 AI 问答——注册即免费送 1 次，无需兑换码。点击右上角「登录领免费次数」。';
        if (data.needRedeem) msg = data.error ?? '免费次数已用完。可前往「购买次数」页购买，或使用兑换码。';
        throw new Error(msg);
      }

      const reply = data.text ?? '';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: reply };
        return updated;
      });
      if (typeof data.credits === 'number') setCredits(data.credits);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '解读失败，请检查网络或稍后重试。';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: msg };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden card">
      {/* 标题 */}
      <div className="px-4 py-3 flex-shrink-0 flex items-start justify-between gap-2" style={{ borderBottom: '1px solid var(--bdr)' }}>
        <div>
          <h3 style={{ color: 'var(--ac)', fontSize: 15, letterSpacing: '0.1em', fontWeight: 600 }}>AI 命盘解读</h3>
          <p className="mt-1" style={{ color: 'var(--tx-3)', fontSize: 12 }}>
            古典紫微斗数 · 智慧解析
            {typeof liunianYear === 'number' ? ` · 流年 ${liunianYear}` : ''}
          </p>
        </div>
        <div className="text-right flex-shrink-0" style={{ color: 'var(--tx-3)', fontSize: 12 }}>
          {hasTimePass ? (
            <span style={{ color: 'var(--ac)' }}>不限问 · 时间包</span>
          ) : credits !== null ? (
            credits > 0 ? (
              <span>剩余 <span style={{ color: 'var(--ac)' }}>{credits}</span> 次</span>
            ) : (
              <a href="/pay" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>额度用完 · 去购买</a>
            )
          ) : (
            <a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>登录领免费次数</a>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <div className="text-4xl mb-3" style={{ color: 'var(--ac)', opacity: 0.15 }}>✦</div>
            <p style={{ color: 'var(--tx-3)', fontSize: 14, lineHeight: 1.8 }}>
              命盘已生成，可直接提问<br />
              或从下方选择常见问题开始解读
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`rounded-2xl ${msg.role === 'user' ? 'max-w-[92%] px-4 py-3' : 'w-full px-4 py-3.5'}`}
                style={msg.role === 'user' ? {
                  background: 'var(--ac-bg)',
                  border: '1px solid var(--ac-bdr)',
                  color: 'var(--ac)',
                  fontSize: 15,
                  lineHeight: 1.85,
                } : {
                  background: 'transparent',
                  color: 'var(--tx-1)',
                  fontSize: 15,
                  lineHeight: 1.9,
                }}
              >
                {msg.role === 'assistant' && (
                  <div className="mb-2" style={{ color: 'var(--tx-3)', fontSize: 12 }}>命理师 ·</div>
                )}
                <div className="whitespace-pre-wrap" style={{ fontSize: 'inherit', lineHeight: 'inherit' }}>
                  {renderRichText(msg.content)}
                  {loading && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse" style={{ background: 'var(--ac)', opacity: 0.6 }} />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 预设问题 */}
      {messages.length === 0 && (
        <div className="px-3 pb-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            {PRESET_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                disabled={loading}
                className="text-left rounded-lg px-3 py-2.5 transition-all line-clamp-2"
                style={{
                  color: 'var(--tx-2)',
                  border: '1px solid var(--bdr)',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--ac-bdr)';
                  e.currentTarget.style.color = 'var(--ac)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--bdr)';
                  e.currentTarget.style.color = 'var(--tx-2)';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0" style={{ borderTop: '1px solid var(--bdr)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="输入问题，如：我的感情运势如何？"
            disabled={loading}
            className="flex-1 rounded-lg px-3.5 py-2.5 focus:outline-none transition-colors"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--bdr)',
              color: 'var(--tx-1)',
              fontSize: 14,
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'var(--ac-bg)',
              border: '1px solid var(--ac-bdr)',
              color: 'var(--ac)',
              fontSize: 14,
            }}
          >
            解读
          </button>
        </div>
      </div>
    </div>
  );
}
