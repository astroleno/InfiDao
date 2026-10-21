/** @jest-environment node */
import { flowJson } from '@/lib/flow/model';
import { chargeFlowModel } from '@/lib/flow/model-budget';
import { jsonPrefix } from '@/lib/flow/json-prefix';
jest.mock('@/lib/flow/model-budget', () => ({ chargeFlowModel: jest.fn() }));

test('every JSON split keeps complete fields and never exposes a half string', () => {
  const value = { frames: [{ id: '一', relevant: true, meaning: '原义「𠮷」与\\"引号。', reflection: '前后\n联系。', anchorIds: [] }] };
  const json = JSON.stringify(value);
  for (let i = 1; i <= json.length; i++) {
    const prefix = jsonPrefix(json.slice(0, i)) as typeof value;
    const frame = prefix?.frames?.[0];
    if (frame?.meaning !== undefined) expect(frame.meaning).toBe(value.frames[0]!.meaning);
    if (frame?.reflection !== undefined) expect(frame.reflection).toBe(value.frames[0]!.reflection);
  }
  expect(jsonPrefix(json)).toEqual(value);
  expect(() => jsonPrefix('{"frames":[{"id":"a","id":"b"}]}')).toThrow('Duplicate');
});

test('real SSE parsing exposes a complete meaning before reflection or stream completion, charging once', async () => {
  const original = process.env.FLOW_API_KEY; process.env.FLOW_API_KEY = 'test-only';
  const output = { frames: [{ id: 'f', relevant: true, meaning: '确定的𠮷原义。', reflection: '完整的联系。', anchorIds: [] }] };
  const prefix = '{"frames":[{"id":"f","relevant":true,"meaning":"确定的𠮷原义。",';
  const suffix = '"reflection":"完整的联系。","anchorIds":[]}]}';
  const encode = (part: unknown) => new TextEncoder().encode('data: ' + JSON.stringify(part) + '\r\n\r\n');
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const fetcher = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true, thinking: { type: 'disabled' } });
    return { ok: true, headers: { get: () => 'text/event-stream' }, body: new ReadableStream({ async start(controller) {
      const bytes = encode({ choices: [{ delta: { content: prefix } }] });
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      await gate;
      controller.enqueue(encode({ choices: [{ delta: { content: suffix }, finish_reason: 'stop' }] }));
      controller.enqueue(encode({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
      controller.close();
    } }) } as unknown as Response;
  });
  let seen!: () => void;
  const arrived = new Promise<void>(resolve => { seen = resolve; });
  const observations: any[] = [];
  const chargeBefore = jest.mocked(chargeFlowModel).mock.calls.length;
  try {
    const task = flowJson('', {}, new AbortController().signal, { onProgress: async value => {
      observations.push(value);
      if ((value as any).frames?.[0]?.meaning) seen();
    } });
    await arrived;
    expect(observations.at(-1).frames[0]).toEqual({ id: 'f', relevant: true, meaning: '确定的𠮷原义。' });
    finish();
    await expect(task).resolves.toEqual(output);
    expect(jest.mocked(chargeFlowModel).mock.calls.length - chargeBefore).toBe(1);
  } finally {
    finish(); fetcher.mockRestore();
    if (original === undefined) delete process.env.FLOW_API_KEY; else process.env.FLOW_API_KEY = original;
  }
});

test('caller cancellation after a paragraph stops later delivery without accepting a truncated result', async () => {
  const original = process.env.FLOW_API_KEY; process.env.FLOW_API_KEY = 'test-only';
  const controller = new AbortController(), seen: unknown[] = [];
  const bytes = new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: '{"frames":[{"id":"f","relevant":true,' } }] }) + '\n\n');
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, headers: { get: () => 'text/event-stream' }, body: new ReadableStream({
    start(stream) { stream.enqueue(bytes); stream.close(); },
  }) } as unknown as Response);
  try {
    await expect(flowJson('', {}, controller.signal, { onProgress: async value => { seen.push(value); controller.abort(); } }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toHaveLength(1);
  } finally {
    fetcher.mockRestore();
    if (original === undefined) delete process.env.FLOW_API_KEY; else process.env.FLOW_API_KEY = original;
  }
});
