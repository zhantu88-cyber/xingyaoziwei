'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  return (
    <main className="relative flex min-h-[92svh] items-center justify-center overflow-hidden px-6 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="select-none font-serif" style={{ fontSize: 'clamp(240px, 42vw, 520px)', lineHeight: 1, color: 'var(--t-gold)', opacity: 0.05 }}>☯</span>
      </div>
      <section className="relative z-10 flex flex-col items-center">
        <h1 className="grad-text grad-text-dark mb-5 font-bold leading-none" style={{ fontSize: 'clamp(56px, 10vw, 124px)', letterSpacing: '0.07em' }}>
          星耀紫微
        </h1>
        <p className="mb-8 text-sm tracking-[0.16em] sm:text-base" style={{ color: 'var(--t-text)' }}>
          探索传统文化与个人特质
        </p>
        <button type="button" onClick={() => router.push('/chart')} className="rounded-full px-10 py-4 font-semibold tracking-widest transition-transform hover:-translate-y-0.5" style={{ background: 'linear-gradient(135deg,#6a4206,#9a6810,#6a4206)', color: '#f8f3e8' }}>
          立即起盘
        </button>
      </section>
    </main>
  );
}
