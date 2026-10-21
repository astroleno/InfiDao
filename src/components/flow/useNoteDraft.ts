import { useEffect, useRef, useState } from 'react';
import { readingStorage } from '@/lib/flow-browser/storage';

/** The caller keys the editor by its quotation or note, including across dialogs. */
export function useNoteDraft(key: string | undefined, initial = '') {
  const [text, setText] = useState(initial);
  const [message, setMessage] = useState('');
  const current = useRef(initial);
  const revision = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const version = revision.current;
    if (key) void readingStorage.loadNoteDraft(key).then(value => {
      if (!alive.current || revision.current !== version || value === null) return;
      current.current = value;
      setText(value);
    });
    return () => { alive.current = false; };
  }, [key]);

  function change(value: string) {
    const version = ++revision.current;
    current.current = value;
    setText(value);
    setMessage('');
    if (key) void readingStorage.saveNoteDraft(key, value).then(result => {
      if (alive.current && revision.current === version && !result.persisted) {
        setMessage('草稿暂未存到本机，请勿关闭页面。');
      }
    });
  }

  async function clear(expected: string, replacement = '') {
    const result = key ? await readingStorage.clearNoteDraft(key, expected) : { persisted: true };
    const unchanged = current.current === expected;
    if (alive.current && unchanged) {
      revision.current++;
      current.current = replacement;
      setText(replacement);
      setMessage(result.persisted ? '' : '草稿清理未成功，重开后可能仍会显示。');
    }
    return unchanged;
  }

  return { text, change, clear, message };
}
