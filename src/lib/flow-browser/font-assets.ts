import { FLOW_RELEASE } from './release.generated';

// Shared by the server-rendered preload and the browser's integrity-checked loader.
export const FLOW_FONT_LOCAL_BASE = FLOW_RELEASE.fontBasePath;
export const FLOW_FONT_CDN_BASE = process.env.NEXT_PUBLIC_FLOW_FONT_CDN_BASE?.replace(/\/$/, '') || '';
export const FLOW_FONT_BASE = FLOW_FONT_CDN_BASE || FLOW_FONT_LOCAL_BASE;
