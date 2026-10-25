import type { Metadata } from 'next';
import { ReadingClosingCards } from '@/components/flow/ReadingClosingCards';

export const metadata: Metadata = {
  title: '留一句 · 六经注我',
  description: '读到这里，留一句经文，慢慢读。',
  robots: { index: false, follow: true },
};

export default function ReadingKeepsakePage() {
  return <main style={{ minHeight: '100dvh', background: 'var(--void, #020303)' }}><ReadingClosingCards /></main>;
}
