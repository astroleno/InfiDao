'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { PersonalNote } from '@/lib/flow-browser/storage';
import styles from './flow.module.css';

type Props = {
  notes: PersonalNote[];
  saving: boolean;
  onSave: (text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUndo: () => Promise<void>;
};

export function NotesPanel({ notes, saving, onSave, onDelete, onUndo }: Props) {
  const [draft, setDraft] = useState('');
  const [removed, setRemoved] = useState(false);
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | 'undo' | 'input' | null>(null);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === 'undo') undoRef.current?.focus();
    else if (target === 'input') panelRef.current?.querySelector('textarea')?.focus();
    else Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[data-note-id]') || []).find(button => button.dataset.noteId === target)?.focus();
  }, [notes, removed, message, deleting]);

  async function submit() {
    const text = draft.trim();
    if (!text || saving) return;
    await onSave(text);
    setDraft('');
  }

  async function remove(id: string) {
    if (deleting) return;
    const index = notes.findIndex(note => note.id === id);
    const next = notes[index + 1] || notes[index - 1];
    const trigger = document.activeElement;
    setDeleting(true);
    try {
      await onDelete(id);
      // Do not pull focus back if the reader moved elsewhere while saving.
      if (document.activeElement === trigger || document.activeElement === document.body) pendingFocus.current = next?.id || 'undo';
      setRemoved(true);
      setMessage('注脚已删除，可以撤销。');
    } catch {
      setMessage('删除未成功，请重试。');
    } finally { setDeleting(false); }
  }

  async function undo() {
    try {
      await onUndo();
      pendingFocus.current = 'input';
      setRemoved(false);
      setMessage('注脚已恢复。');
    } catch { setMessage('恢复未成功，请重试。'); }
  }

  return (
    <section ref={panelRef} className={styles.notesPanel} aria-labelledby="flow-notes-title">
      <h2 id="flow-notes-title">自己的注脚</h2>
      <p className={styles.muted}>只保存在这台设备，不会作为模型内容发送。</p>
      <label className={styles.srOnly} htmlFor="flow-note-input">写下自己的注脚</label>
      <textarea id="flow-note-input" value={draft} maxLength={1000} onChange={event => setDraft(event.target.value)} placeholder="记下你自己的联想……" />
      <button className={styles.quietButton} type="button" disabled={!draft.trim() || saving} onClick={() => void submit()}>
        {saving ? '保存中' : '保存注脚'}
      </button>
      {notes.map(note => (
        <article key={note.id} className={styles.noteItem}>
          <p>{note.text}</p>
          <button data-note-id={note.id} className={styles.textButton} type="button" disabled={deleting} onClick={() => void remove(note.id)}>删除</button>
        </article>
      ))}
      {removed && <button ref={undoRef} className={styles.textButton} type="button" onClick={() => void undo()}>撤销删除</button>}
      <p className={styles.muted} role="status">{message}</p>
    </section>
  );
}
