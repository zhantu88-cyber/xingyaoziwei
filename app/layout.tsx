import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import SiteNav from '@/components/SiteNav';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: '星耀紫微',
  description: '提供紫微斗数排盘与传统文化研究参考。',
  keywords: '紫微斗数, 命盘, 传统文化',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: '星耀紫微',
    description: '提供紫微斗数排盘与传统文化研究参考。',
    url: SITE_URL,
    siteName: '星耀紫微',
    locale: 'zh_CN',
    type: 'website',
  },
  // 站长平台验证（拿到 verification code 后填入对应字段，重新部署即可）
  verification: {
    // Google Search Console: 在 https://search.google.com/search-console 添加站点后获取
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined,
    // Bing Webmaster Tools: 在 https://www.bing.com/webmasters 添加站点后获取
    other: {
      'msvalidate.01': process.env.NEXT_PUBLIC_BING_VERIFICATION || '808FFC6023A2C359B375DD860FEDA856',
      // 百度站长（等执照下来后）
      'baidu-site-verification': process.env.NEXT_PUBLIC_BAIDU_VERIFICATION || '',
      // 360 站长（等执照下来后）
      '360-site-verification': process.env.NEXT_PUBLIC_360_VERIFICATION || '',
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light">
      <body className="min-h-screen">
        <ThemeProvider>
          <SiteNav />
          {children}
        </ThemeProvider>
        <footer className="px-5 py-5 text-center text-[10px] leading-relaxed" style={{ color: '#9ca3af' }}>
          本站内容整理自《紫微斗数全书》等公有领域古籍，仅供传统文化研究与个人性格参考，不构成任何生活、医疗或投资建议。请理性看待，切勿迷信。
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

