import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { FLOW_FONT_BASE } from '@/lib/flow-browser/font-assets';
import { FLOW_RELEASE } from '@/lib/flow-browser/release.generated';
import { PUBLIC_READER_PATH, publicReaderOrigin } from '@/lib/flow-browser/public-route';

export const viewport: Viewport = { themeColor: '#020303' };

export async function generateMetadata(): Promise<Metadata> {
  const origin = publicReaderOrigin((await headers()).get('host'));
  const shareImage = `${origin}/flow-assets/share/reader-v1.png`;
  return {
  metadataBase: new URL(origin),
  title: '六经注我 · 一念相连',
  description: '从此刻的一念进入经典，点词接续，在经文与自己的思考之间一直读下去。',
  alternates: { canonical: `${origin}${PUBLIC_READER_PATH}` },
  openGraph: {
    title: '六经注我 · 一念相连',
    description: '从此刻的一念进入经典，点词接续，在经文与自己的思考之间一直读下去。',
    url: `${origin}${PUBLIC_READER_PATH}`,
    siteName: '六经注我', type: 'website', locale: 'zh_CN',
    images: [{ url: shareImage, width: 1200, height: 630, alt: '六经注我 · 以此刻一念进入经典' }],
  },
  twitter: {
    card: 'summary_large_image', title: '六经注我 · 一念相连',
    description: '从此刻的一念进入经典，点词接续，在经文与自己的思考之间一直读下去。',
    images: [shareImage],
  },
  };
}

export default function InfiDaoPage() {
  return <>
    <link rel="preload" as="fetch" type="application/json" href={`${FLOW_FONT_BASE}/manifest.json`} crossOrigin="anonymous" />
    {FLOW_RELEASE.fontPreloads.map(file => <link key={file} rel="preload" as="fetch" type="font/woff" href={`${FLOW_FONT_BASE}/${file}`} crossOrigin="anonymous" />)}
    <FlowExperience />
  </>;
}
