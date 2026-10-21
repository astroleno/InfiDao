import type { Metadata, Viewport } from 'next';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { FLOW_FONT_BASE } from '@/lib/flow-browser/font-assets';
import { FLOW_RELEASE } from '@/lib/flow-browser/release.generated';

export const viewport: Viewport = { themeColor: '#020303' };

export const metadata: Metadata = {
  title: '六经注我 · 一念相连',
  description: '从此刻的一念进入经典，点词接续，在经文与自己的思考之间一直读下去。',
  alternates: { canonical: 'https://aitoshuu.me/infidao' },
  openGraph: {
    title: '六经注我 · 一念相连',
    description: '从此刻的一念进入经典，点词接续，在经文与自己的思考之间一直读下去。',
    url: 'https://aitoshuu.me/infidao',
    siteName: '六经注我', type: 'website', locale: 'zh_CN',
    images: [{ url: 'https://aitoshuu.me/flow-assets/share/reader-v1.png', width: 1200, height: 630, alt: '六经注我 · 以此刻一念进入经典' }],
  },
  twitter: {
    card: 'summary_large_image', title: '六经注我 · 一念相连',
    description: '从此刻的一念进入经典，点词接续，在经文与自己的思考之间一直读下去。',
    images: ['https://aitoshuu.me/flow-assets/share/reader-v1.png'],
  },
};

export default function InfiDaoPage() {
  return <>
    <link rel="preload" as="fetch" type="application/json" href={`${FLOW_FONT_BASE}/manifest.json`} crossOrigin="anonymous" />
    {FLOW_RELEASE.fontPreloads.map(file => <link key={file} rel="preload" as="fetch" type="font/woff" href={`${FLOW_FONT_BASE}/${file}`} crossOrigin="anonymous" />)}
    <FlowExperience />
  </>;
}
