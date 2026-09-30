import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { FlowError } from './contracts';

const COOKIE_TTL = 7 * 24 * 60 * 60;
let developmentSecret: string | undefined;
function secret() {
  const configured = process.env.FLOW_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production') throw new FlowError('SESSION_UNAVAILABLE', '在线阅读尚未配置好，已保存的经文仍可阅读。', 503);
  return developmentSecret ??= randomBytes(32).toString('hex');
}
const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-infidao_flow' : 'infidao_flow';
const signature = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');
export function createSessionToken(now = Date.now()) {
  const body = randomUUID() + '.' + (Math.floor(now / 1000) + COOKIE_TTL);
  return body + '.' + signature(body);
}
export function verifySessionToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token || !/^[0-9a-f-]{36}\.[0-9]{10,12}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [id, expires, mac] = token.split('.');
  const expiry = Number(expires), time = Math.floor(now / 1000);
  if (expiry <= time || expiry > time + COOKIE_TTL + 60) return null;
  const expected = Buffer.from(signature(id + '.' + expires)), received = Buffer.from(mac!);
  return expected.length === received.length && timingSafeEqual(expected, received) ? id! : null;
}
export function isNativeRequest(request: Request) {
  return request.headers.get('x-flow-client') === 'native' && !request.headers.get('origin') &&
    (process.env.NODE_ENV !== 'production' || process.env.FLOW_NATIVE_HTTP_ENABLED === '1');
}
export function checkFlowOrigin(request: Request) {
  if (isNativeRequest(request)) return;
  const expected = process.env.FLOW_PUBLIC_ORIGIN || (process.env.NODE_ENV !== 'production' ? new URL(request.url).origin : '');
  const origin = request.headers.get('origin');
  if (!expected || !origin || origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new FlowError('ORIGIN_DENIED', '请从网站重新打开阅读。', 403);
  }
}
function cookieToken(request: Request) {
  const name = cookieName() + '=';
  return request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith(name))?.slice(name.length);
}
export function requestSession(request: Request) {
  const legacy = process.env.NODE_ENV !== 'production' && process.env.FLOW_ALLOW_LEGACY_HTTP_SESSION === '1' ? request.headers.get('x-flow-session') : null;
  if (legacy && /^[A-Za-z0-9_-]{24,96}$/.test(legacy)) return 'legacy-' + legacy;
  checkFlowOrigin(request);
  const token = isNativeRequest(request) ? request.headers.get('authorization')?.replace(/^Bearer /, '') : cookieToken(request);
  const owner = verifySessionToken(token);
  if (!owner) throw new FlowError('INVALID_SESSION', '这次阅读的连接已过期，请重试。', 401);
  return owner;
}
export function issueSession(request: Request) {
  checkFlowOrigin(request);
  const old = isNativeRequest(request) ? request.headers.get('authorization')?.replace(/^Bearer /, '') : cookieToken(request);
  const token = verifySessionToken(old) ? old! : createSessionToken();
  return { token, owner: verifySessionToken(token)!, cookie: cookieName() + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + COOKIE_TTL +
    (process.env.NODE_ENV === 'production' ? '; Secure' : '') };
}
export function requestIPKey(request: Request) {
  const forwarded = process.env.FLOW_TRUST_PROXY === '1' ? request.headers.get('x-real-ip') : null;
  const ip = forwarded && isIP(forwarded) ? forwarded : 'direct';
  return createHmac('sha256', secret()).update('ip:' + ip).digest('hex').slice(0, 32);
}
