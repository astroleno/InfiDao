'use client';
import { useRef, useState } from 'react';
import type { PersonalNote } from '@/lib/flow-browser/storage';
import styles from './flow.module.css';
import { useNoteDraft } from './useNoteDraft';

export function EditableNote({ note, onUpdate }: { note: PersonalNote; onUpdate: (id: string, text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setEditing(false); requestAnimationFrame(() => trigger.current?.focus()); }
  return <div className={styles.noteBody}>
    {editing ? <NoteEditor note={note} onUpdate={onUpdate} onClose={close} /> : <>
      <p>{note.text}</p>
      <button ref={trigger} type="button" className={styles.textButton} onClick={() => setEditing(true)}>编辑</button>
    </>}
  </div>;
}

function NoteEditor({ note, onUpdate, onClose }: { note: PersonalNote; onUpdate: (id: string, text: string) => Promise<void>; onClose: () => void }) {
  const draft = useNoteDraft('edit:' + note.id, note.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    const original = draft.text;
    setBusy(true); setError('');
    try { await onUpdate(note.id, original); await draft.clear(original); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存未成功，请重试。'); }
    finally { setBusy(false); }
  }
  return <>
      <label className={styles.srOnly} htmlFor={`edit-${note.id}`}>编辑注脚</label>
      <textarea id={`edit-${note.id}`} autoFocus disabled={busy} value={draft.text} maxLength={1000} onChange={event => draft.change(event.target.value)} />
      <button type="button" className={styles.textButton} disabled={busy || !draft.text.trim()} onClick={() => void save()}>{busy ? '保存中' : '保存修改'}</button>
      <button type="button" className={styles.textButton} disabled={busy} onClick={() => { void draft.clear(draft.text).then(onClose); }}>取消</button>
      {(error || draft.message) && <p className={styles.seedError} role="status">{error || draft.message}</p>}
  </>;
}
