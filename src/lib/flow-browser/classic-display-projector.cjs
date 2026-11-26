// The build verifies this projection against OpenCC on the full authority set.
const compatibilityIdeograph = /[\u{f900}-\u{faff}\u{2f800}-\u{2fa1f}]/gu;
const normalizeClassic = text => text.replace(compatibilityIdeograph, char => char.normalize('NFKC'));

function createClassicProjector({ characters, phrases }) {
  const prefixes = new Map();
  for (const [key, value] of Object.entries(phrases)) {
    const first = String.fromCodePoint(key.codePointAt(0));
    if (!prefixes.has(first)) prefixes.set(first, []);
    prefixes.get(first).push([key, value]);
  }
  for (const bucket of prefixes.values()) bucket.sort((a, b) => b[0].length - a[0].length);

  return function project(source, onPhrase) {
    const original = Array.from(source);
    const normalized = normalizeClassic(source);
    const display = [];
    let canonicalIndex = 0;
    for (let cursor = 0; cursor < normalized.length;) {
      const char = String.fromCodePoint(normalized.codePointAt(cursor));
      const phrase = prefixes.get(char)?.find(([key]) => normalized.startsWith(key, cursor));
      const [input, output] = phrase ?? [char, characters[char] ?? char];
      if (phrase) onPhrase?.(input, output);
      const glyphs = Array.from(output);
      // A change in scalar count gives no unambiguous boundary inside a
      // lexical token. Keep the entire source readable in its stored form.
      const count = Array.from(input).length;
      if (glyphs.length !== count) return null;
      for (const glyph of glyphs) display[canonicalIndex++] = glyph;
      cursor += input.length;
    }
    if (canonicalIndex !== original.length) return null;

    let sourceOffset = 0, displayOffset = 0;
    const offsets = new Map([[0, 0]]);
    original.forEach((char, index) => {
      sourceOffset += char.length;
      displayOffset += display[index].length;
      offsets.set(sourceOffset, displayOffset);
    });
    const text = display.join('');
    return { text, slice(start, end) {
      const a = offsets.get(start), b = offsets.get(end);
      if (a === undefined || b === undefined || a > b) return null;
      return text.slice(a, b);
    } };
  };
}

module.exports = { createClassicProjector, normalizeClassic };
