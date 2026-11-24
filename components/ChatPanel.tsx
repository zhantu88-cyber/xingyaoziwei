'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart } from '@/lib/ziwei/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  chart: ZiweiChart;
}

const PRESET_QUESTIONS = [
  '我的整体命格如何？性格特点是什么？',
  '我的感情婚姻运势如何？',
  '我的事业财运如何？适合什么方向？',
  '我现在的大限运势如何？',
  '我的健康需要注意什么？',
  '今年的流年运势如何？',
];

export default function ChatPanel({ chart }: ChatPanelProps) {
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
        body: JSON.stringify({ chart, messages: [...messages, userMsg] }),
      });

      const data = await res.json().catch(() => ({})) as {
        text?: string; error?: string; needLogin?: boolean; needRedeem?: boolean;
        credits?: number | null; dailyCount?: number;
      };

      if (!res.ok) {
        let msg = data.error ?? '解读失败，请稍后重试。';
        if (data.needLogin) msg = '请先登录后再使用 AI 问答——注册即免费送 1 次，无需兑换码。点击右上角「登录领免费次数」。';
        if (data.needRedeem) msg = data.error ?? '暂无可用额度，请先到「账号与兑换」页面输入兑换码。';
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
    <div className="flex flex-col h-full rounded-xl overflow-hidden card-glass">
      {/* 标题 */}
      <div className="px-4 py-3 flex-shrink-0 flex items-start justify-between gap-2" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div>
          <h3 className="text-xs font-medium tracking-widest" style={{ color: 'var(--t-gold)' }}>AI 命盘解读</h3>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--t-faint)' }}>倪海厦正宗紫微斗数 · 智慧解析</p>
        </div>
        <div className="text-right text-[10px] flex-shrink-0" style={{ color: 'var(--t-faint)' }}>
          {hasTimePass ? (
            <span style={{ color: 'var(--t-gold)' }}>不限问 · 时间包</span>
          ) : credits !== null ? (
            <span>剩余 <span style={{ color: 'var(--t-gold)' }}>{credits}</span> 次</span>
          ) : (
            <a href="/redeem" style={{ color: 'var(--t-gold)', textDecoration: 'underline' }}>登录领免费次数</a>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.15 }}>✦</div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--t-faint)' }}>
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
                className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
                style={msg.role === 'user' ? {
                  background: 'rgba(212,168,67,0.1)',
                  border: '1px solid rgba(212,168,67,0.2)',
                  color: 'var(--t-gold)',
                } : {
                  background: 'var(--t-card)',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text)',
                }}
              >
                {msg.role === 'assistant' && (
                  <div className="text-[10px] mb-1" style={{ color: 'var(--t-faint)' }}>命理师 ·</div>
                )}
                <div className="whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content}
                  {loading && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="inline-block w-1.5 h-3 ml-0.5 animate-pulse" style={{ background: 'var(--t-gold)', opacity: 0.6 }} />
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
                className="text-left text-[10px] rounded-lg px-2.5 py-2 transition-all line-clamp-2"
                style={{
                  color: 'var(--t-text2)',
                  border: '1px solid var(--t-border)',
                  background: 'transparent',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'rgba(212,168,67,0.3)';
                  e.currentTarget.style.color = 'var(--t-gold)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--t-border)';
                  e.currentTarget.style.color = 'var(--t-text2)';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="输入问题，如：我的感情运势如何？"
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-xs focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            解读
          </button>
        </div>
      </div>
    </div>
  );
}
