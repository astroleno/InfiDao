const KEY = 'infidao-notes-v1';
const LIMIT = 100;

function createNoteStore(api) {
  const read = () => {
    const value = api.getStorageSync(KEY);
    if (!value) return [];
    if (!Array.isArray(value)) throw new Error('Invalid notes');
    return value.filter(note => note && typeof note.id === 'string' && typeof note.text === 'string' && typeof note.quote === 'string');
  };
  const write = notes => { api.setStorageSync(KEY, notes); return notes; };
  return {
    list: read,
    add(context, text) {
      const value = String(text).trim();
      if (!value || value.length > 300) throw new Error('Invalid note');
      const notes = read();
      if (notes.length >= LIMIT) throw new Error('Notes full');
      const createdAt = Date.now();
      const note = { id: createdAt.toString(36) + Math.random().toString(36).slice(2, 8), createdAt,
        passageId: context.passageId, sourceId: context.sourceId, quote: context.quote,
        source: context.source, chapterLabel: context.chapterLabel, seed: context.seed || '', text: value };
      return write([note, ...notes]);
    },
    remove(id) {
      const notes = read(), note = notes.find(item => item.id === id);
      if (!note) return null;
      write(notes.filter(item => item.id !== id));
      return note;
    },
    restore(note) {
      const notes = read();
      if (!note || notes.some(item => item.id === note.id)) return notes;
      if (notes.length >= LIMIT) throw new Error('Notes full');
      return write([note, ...notes].sort((a, b) => b.createdAt - a.createdAt));
    },
  };
}

module.exports = { createNoteStore, KEY, LIMIT };
