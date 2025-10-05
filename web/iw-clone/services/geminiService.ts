/**
 * 说明：本文件已改写为调用本项目自有的 API（/api/search, /api/annotate），
 * 不再依赖外部 Gemini 服务。
 * - 流式协议：ReadableStream，按行 JSON（type: chunk/meta/end）
 * - 错误规范：{ success: false, error: { code, message } }
 */

export interface AsciiArtData {
  art: string;
  text?: string; // Text is now optional
}

/**
 * 从本地注释 API 流式获取文本（将两段式内容串接为连续文本）。
 * @param topic 主题词/查询词
 * @returns 异步生成器，逐步产出可显示的文本块
 */
export async function* streamDefinition(
  topic: string,
): AsyncGenerator<string, void, undefined> {
  // 将注释接口视为“topic 的定义说明”，把两段式注释按顺序输出
  try {
    const response = await fetch('/api/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: topic, model: 'glm' })
    });

    if (!response.ok || !response.body) {
      const msg = `Annotate API failed: ${response.status}`;
      console.error(msg);
      yield `Error: ${msg}`;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.type === 'chunk' && evt.data) {
            // 依次拼接两段式内容
            const piece = evt.data.six_to_me || evt.data.me_to_six || '';
            if (piece) {
              accumulated += piece;
              yield piece; // 将新增片段流式吐出
            }
          }
          // meta/end 在此处不直接输出
        } catch (e) {
          // 非法行忽略，但记录以便排障
          console.warn('Invalid JSON line from /api/annotate:', line);
        }
      }
    }
  } catch (error) {
    console.error('Error streaming from /api/annotate:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    yield `Error: Could not stream annotation for "${topic}": ${message}`;
    throw error;
  }
}

/**
 * 生成单个随机词（本地实现）。
 * @returns 随机词
 */
export async function getRandomWord(): Promise<string> {
  // 使用固定词表（可与页面侧的词表保持一致），此处返回简单占位
  const candidates = ['Harmony', 'Flow', 'Unity', 'Resonance', 'Equilibrium'];
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

/**
 * 生成 ASCII 头图（本地 fallback 实现）。
 * @param topic 主题词
 * @returns AsciiArtData
 */
export async function generateAsciiArt(topic: string): Promise<AsciiArtData> {
  try {
    const displayableTopic = topic.length > 20 ? topic.substring(0, 17) + '...' : topic;
    const padded = ` ${displayableTopic} `;
    const top = `┌${'─'.repeat(padded.length)}┐`;
    const mid = `│${padded}│`;
    const bot = `└${'─'.repeat(padded.length)}┘`;
    return { art: `${top}\n${mid}\n${bot}` };
  } catch (e) {
    // 理论上不会抛错，仍保留兜底
    console.error('ASCII fallback generation failed', e);
    return { art: `[ ${topic} ]` };
  }
}
