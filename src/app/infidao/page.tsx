import type { Metadata } from 'next';
import { FlowExperience } from '@/components/flow/FlowExperience';
import { FLOW_FONT_BASE } from '@/lib/flow-browser/font-assets';

export const metadata: Metadata = {
  title: '六经注我 · 经轮阅读',
  description: '从此刻的一念进入经典，在经文、原文与个人阅读之间继续探索。',
};

export default function InfiDaoPage() {
  return <>
    <link rel="preload" as="fetch" type="application/json" href={`${FLOW_FONT_BASE}/manifest.json`} crossOrigin="anonymous" />
    <FlowExperience />
  </>;
}
