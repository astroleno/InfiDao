import type { Metadata } from 'next';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { FLOW_FONT_BASE } from '@/lib/flow-browser/font-assets';

export const metadata: Metadata = {
  title: '六经注我 · 经轮阅读',
  description: '从此刻的一念进入经典，在经文、原文与个人阅读之间继续探索。',
  alternates: { canonical: 'https://aitoshuu.me/infidao' },
  openGraph: {
    title: '六经注我 · 经轮阅读',
    description: '从此刻的一念进入经典，在经文、原文与个人阅读之间继续探索。',
    url: 'https://aitoshuu.me/infidao',
    siteName: '六经注我', type: 'website', locale: 'zh_CN',
    images: [{ url: 'https://aitoshuu.me/flow-assets/share/reader-v1.png', width: 1200, height: 630, alt: '六经注我 · 以此刻一念进入经典' }],
  },
  twitter: {
    card: 'summary_large_image', title: '六经注我 · 经轮阅读',
    description: '从此刻的一念进入经典，在经文、原文与个人阅读之间继续探索。',
    images: ['https://aitoshuu.me/flow-assets/share/reader-v1.png'],
  },
};

export default function InfiDaoPage() {
  return <>
    <link rel="preload" as="fetch" type="application/json" href={`${FLOW_FONT_BASE}/manifest.json`} crossOrigin="anonymous" />
    <FlowExperience />
  </>;
}
