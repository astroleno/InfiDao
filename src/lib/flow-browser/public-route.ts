export const PUBLIC_READER_PATH = '/InfiDao';

/** Public metadata must use a known site origin rather than an arbitrary Host. */
export function publicReaderOrigin(host: string | null): string {
  const hostname = host?.trim().toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  return hostname === 'tongye.me' ? 'https://tongye.me' : 'https://aitoshuu.me';
}
