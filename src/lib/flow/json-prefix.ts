/**
 * Read completed JSON values from a bounded prefix. Strings are never exposed
 * before their closing quote; incomplete objects/arrays retain complete children.
 * This is only for progressive delivery. The final document still uses JSON.parse
 * and the normal response schema.
 */
export function jsonPrefix(text: string): unknown {
  let index = 0;
  const space = () => { while (/\s/u.test(text[index] || '') && index < text.length) index++; };
  type Value = { value?: unknown; complete: boolean; container?: boolean };
  function read(depth = 0): Value {
    if (depth > 16) throw new SyntaxError('JSON nesting limit');
    space();
    const first = text[index];
    if (first === '"') {
      const start = index++;
      let escape = false;
      while (index < text.length) {
        const char = text[index++]!;
        if (!escape && char === '"') return { value: JSON.parse(text.slice(start, index)), complete: true };
        if (!escape && char === '\\') escape = true;
        else escape = false;
      }
      return { complete: false };
    }
    if (first === '{' || first === '[') {
      const object = first === '{', close = object ? '}' : ']';
      const result: Record<string, unknown> | unknown[] = object ? Object.create(null) : [];
      const keys = new Set<string>();
      index++;
      space();
      if (text[index] === close) { index++; return { value: result, complete: true, container: true }; }
      while (index < text.length) {
        let key: string | undefined;
        if (object) {
          if (text[index] !== '"') throw new SyntaxError('Expected JSON key');
          const parsed = read(depth + 1);
          if (!parsed.complete) break;
          key = parsed.value as string;
          if (keys.has(key)) throw new SyntaxError('Duplicate JSON key');
          keys.add(key);
          space();
          if (index === text.length) break;
          if (text[index++] !== ':') throw new SyntaxError('Expected JSON colon');
        }
        const child = read(depth + 1);
        if (child.complete || child.container) {
          if (object) (result as Record<string, unknown>)[key!] = child.value;
          else (result as unknown[]).push(child.value);
        }
        if (!child.complete) break;
        space();
        if (index === text.length) break;
        if (text[index] === close) { index++; return { value: result, complete: true, container: true }; }
        if (text[index++] !== ',') throw new SyntaxError('Expected JSON separator');
        space();
        if (text[index] === close) throw new SyntaxError('Trailing JSON comma');
      }
      return { value: result, complete: false, container: true };
    }
    const start = index;
    while (index < text.length && !/[\s,\]}]/u.test(text[index]!)) index++;
    if (index === text.length) return { complete: false };
    if (index === start) throw new SyntaxError('Expected JSON value');
    return { value: JSON.parse(text.slice(start, index)), complete: true };
  }
  return read().value;
}
