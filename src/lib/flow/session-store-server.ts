import { createClient } from 'redis';
import { randomUUID } from 'node:crypto';
import { FlowError } from './contracts';
import { createSessionStore, MemoryDocumentBackend, type AtomicDocumentBackend } from './session-store';

// The final lease check uses Redis time at commit, after the optimistic read.
// An expired worker cannot commit even if another worker has not claimed it yet.
export const SESSION_COMPARE_SWAP = `
local current = redis.call('GET', KEYS[1])
if ARGV[4] ~= '' then
  if not current then return -1 end
  local document = cjson.decode(current)
  local operation = document.operations[ARGV[4]]
  local time = redis.call('TIME')
  local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
  if not operation or operation.holder ~= ARGV[5] or operation.version ~= tonumber(ARGV[6]) or operation.expiresAt <= now then return -1 end
end
if (current or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`;

type RedisConnection = { sendCommand: (args: string[]) => Promise<unknown>; readonly isReady: boolean; destroy: () => void };
export function createRedisDocumentBackend(client: Pick<RedisConnection, 'sendCommand'>): AtomicDocumentBackend {
  return {
    async read(key) {
      const [raw, time] = await Promise.all([client.sendCommand(['GET', key]), client.sendCommand(['TIME'])]);
      const parts = time as string[];
      return { value: raw === null ? null : String(raw), now: Number(parts[0]) * 1000 + Math.floor(Number(parts[1]) / 1000) };
    },
    async compareSwap(key, expected, value, ttlMs, lease) {
      const result = await client.sendCommand(['EVAL', SESSION_COMPARE_SWAP, '1', key, expected ?? '', value, String(ttlMs),
        lease?.key || '', lease?.holder || '', String(lease?.version || 0)]);
      return result === 1 ? 'ok' : result === -1 ? 'lost' : 'conflict';
    },
  };
}

let connecting: Promise<RedisConnection> | null = null;
export async function flowRedis() {
  const url = process.env.FLOW_REDIS_URL;
  if (!url) throw new FlowError('STORE_UNAVAILABLE', '在线阅读尚未配置好，已保存的经文仍可阅读。', 503);
  if (!connecting) {
    const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 5000, reconnectStrategy: false } });
    client.on('error', () => { /* Request errors are reported without connection strings or credentials. */ });
    connecting = client.connect().then(() => ({ sendCommand: (args: string[]) => client.sendCommand(args),
      get isReady() { return client.isReady; }, destroy: () => client.destroy() })).catch(() => { client.destroy(); connecting = null;
      throw new FlowError('STORE_UNAVAILABLE', '阅读记录暂时无法保存，请稍后重试。', 503); });
  }
  const client = await connecting;
  if (!client.isReady) { connecting = null; throw new FlowError('STORE_UNAVAILABLE', '阅读记录暂时无法保存，请稍后重试。', 503); }
  return client;
}

const developmentBackend = new MemoryDocumentBackend();
export async function serverSessionStore() {
  const namespace = process.env.FLOW_REDIS_NAMESPACE || (process.env.NODE_ENV === 'production' ? '' : 'infidao-dev');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(namespace)) throw new FlowError('STORE_UNAVAILABLE', '在线阅读尚未配置好，已保存的经文仍可阅读。', 503);
  const backend = process.env.FLOW_REDIS_URL ? createRedisDocumentBackend(await flowRedis()) :
    process.env.NODE_ENV === 'production' ? null : developmentBackend;
  if (!backend) throw new FlowError('STORE_UNAVAILABLE', '在线阅读尚未配置好，已保存的经文仍可阅读。', 503);
  return createSessionStore(backend, { createId: randomUUID, prefix: namespace + ':flow:session:' });
}
