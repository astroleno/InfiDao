import { spawn } from 'node:child_process';
import path from 'node:path';

export class HandwritingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

/** SQLite transactions remain in a small Python bridge shared with the durable worker. */
export function jobStore<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), 'scripts/handwriting/store.py');
    const child = spawn(process.env.HANDWRITING_PYTHON || 'python3', [script, command], {
      env: process.env, stdio: ['pipe', 'pipe', 'ignore'],
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new HandwritingError('STORAGE_UNAVAILABLE', '手写任务暂不可用，请稍后重试。', 503)); }, 15_000);
    child.on('error', () => { clearTimeout(timer); reject(new HandwritingError('NOT_CONFIGURED', '手写任务运行环境尚未配置。', 503)); });
    child.stdout.on('data', (part: Buffer) => { output += part.toString('utf8'); if (output.length > 2_000_000) child.kill(); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(output);
        if (result.ok) resolve(result.value as T);
        else reject(new HandwritingError(result.code, result.message, result.status));
      } catch { reject(new HandwritingError('STORAGE_UNAVAILABLE', '手写任务暂不可用，请稍后重试。', 503)); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(args));
  });
}
