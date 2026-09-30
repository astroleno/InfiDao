/** @jest-environment node */
import { createSessionToken, verifySessionToken, issueSession, requestSession, requestIPKey } from '@/lib/flow/session-identity';
const environment = { ...process.env };
beforeEach(() => { Object.assign(process.env, { NODE_ENV: 'production', FLOW_SESSION_SECRET: 'unit-test-secret-with-at-least-32-characters', FLOW_PUBLIC_ORIGIN: 'https://reading.example', FLOW_NATIVE_HTTP_ENABLED: '1' }); });
afterEach(() => { process.env = { ...environment }; });
const request = (headers: Record<string, string> = {}) => new Request('https://reading.example/api/flow', { method: 'POST', headers: { origin: 'https://reading.example', ...headers } });
test('signed anonymous cookies are HttpOnly, Secure, SameSite and stable for the same reader', () => {
  const first = issueSession(request());
  expect(first.cookie).toContain('HttpOnly'); expect(first.cookie).toContain('SameSite=Strict'); expect(first.cookie).toContain('; Secure');
  const cookie = first.cookie.split(';')[0]!;
  expect(requestSession(request({ cookie }))).toBe(first.owner);
  expect(issueSession(request({ cookie })).owner).toBe(first.owner);
});
test('forged, expired, cross-origin and arbitrary old header identities are rejected', () => {
  const now = 1_800_000_000_000, token = createSessionToken(now);
  expect(verifySessionToken(token, now)).toBeTruthy(); expect(verifySessionToken(token, now + 8 * 86400_000)).toBeNull();
  expect(verifySessionToken(token.slice(0, -1) + '!', now)).toBeNull();
  expect(() => issueSession(request({ origin: 'https://attacker.example' }))).toThrow('重新打开');
  expect(() => requestSession(request({ 'x-flow-session': 'a'.repeat(64) }))).toThrow('连接已过期');
});
test('native HTTP compatibility requires an issued bearer credential', () => {
  const native = new Request('https://reading.example/api/flow/session', { method: 'POST', headers: { 'x-flow-client': 'native' } });
  const issued = issueSession(native);
  const reading = new Request('https://reading.example/api/flow', { method: 'POST', headers: { 'x-flow-client': 'native', authorization: 'Bearer ' + issued.token } });
  expect(requestSession(reading)).toBe(issued.owner);
});
test('proxy addresses affect limits only when trusted; arbitrary forwarded-for is ignored', () => {
  delete process.env.FLOW_TRUST_PROXY;
  expect(requestIPKey(request({ 'x-real-ip': '192.0.2.1' }))).toBe(requestIPKey(request({ 'x-real-ip': '192.0.2.2' })));
  process.env.FLOW_TRUST_PROXY = '1';
  expect(requestIPKey(request({ 'x-real-ip': '192.0.2.1' }))).not.toBe(requestIPKey(request({ 'x-real-ip': '192.0.2.2' })));
  expect(requestIPKey(request({ 'x-forwarded-for': '192.0.2.1' }))).toBe(requestIPKey(request()));
});
