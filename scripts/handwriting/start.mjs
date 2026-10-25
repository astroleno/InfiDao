import nextEnv from '@next/env';
import { spawn } from 'node:child_process';
nextEnv.loadEnvConfig(process.cwd());
const child = spawn(process.env.HANDWRITING_PYTHON || 'python3', ['scripts/handwriting/worker.py'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
child.on('error', () => { console.error('Handwriting worker runtime unavailable'); process.exitCode = 1; });
