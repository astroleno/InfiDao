import type { Metadata } from 'next';
import { MotionCompare } from '@/components/flow/MotionCompare';

export const metadata: Metadata = {
  title: '经文动效对比 · 六经注我',
  robots: { index: false, follow: false },
};

export default function MotionComparePage() {
  return <MotionCompare />;
}
