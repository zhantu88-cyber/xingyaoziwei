'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void },
      ) => void;
    };
  }
}

/**
 * Cloudflare Turnstile 人机验证（入口层防批量注册/刷登录）。
 * 需配置 NEXT_PUBLIC_TURNSTILE_SITE_KEY；未配置时不渲染，后端校验也会跳过，
 * 便于本地开发。生产环境请务必同时配置 secret 与 site key。
 */
export default function Turnstile({ onVerify }: { onVerify: (token: string | null) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onVerify);
  cbRef.current = onVerify;
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;

    const render = () => {
      if (window.turnstile && containerRef.current && containerRef.current.childElementCount === 0) {
        window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => cbRef.current(token),
          'expired-callback': () => cbRef.current(null),
        });
      }
    };

    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} style={{ margin: '4px 0' }} />;
}
