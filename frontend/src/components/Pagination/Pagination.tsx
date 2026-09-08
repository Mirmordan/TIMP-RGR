import { useState, type FormEvent } from 'react';
import styles from './Pagination.module.css';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, pageSize, onChange }: PaginationProps) {
  const [draft, setDraft] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function go(e: FormEvent) {
    e.preventDefault();
    const n = Number.parseInt(draft, 10);
    if (!Number.isFinite(n)) return;
    onChange(Math.min(Math.max(n, 1), totalPages));
    setDraft('');
  }

  // 5 номеров по центру, на краях — сдвиг окна.
  const nums: number[] = [];
  const half = 2; // ±2 от текущей
  let start = Math.max(1, page - half);
  let end = Math.min(totalPages, page + half);

  // Если окно короче 5 — раздвигаем в ту сторону, где есть место.
  while (end - start + 1 < 5 && start > 1) start--;
  while (end - start + 1 < 5 && end < totalPages) end++;

  for (let i = start; i <= end; i++) nums.push(i);

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={styles.pagination}>
      <button
        className={styles.pageBtn}
        disabled={page <= 1}
        onClick={() => onChange(1)}
        title="В начало"
      >
        &laquo;
      </button>

      {nums.map(n => (
        <button
          key={n}
          className={`${styles.pageBtn} ${n === page ? styles.active : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}

      <button
        className={styles.pageBtn}
        disabled={page >= totalPages}
        onClick={() => onChange(totalPages)}
        title="В конец"
      >
        &raquo;
      </button>

      <span className={styles.info}>{from}–{to} из {total}</span>

      <form className={styles.jump} onSubmit={go}>
        <input
          className={styles.jumpInput}
          type="number"
          min={1}
          max={totalPages}
          inputMode="numeric"
          placeholder="…"
          aria-label={`Перейти к странице (1–${totalPages})`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <button className={styles.pageBtn} type="submit" title="Перейти" disabled={draft.trim() === ''}>
          →
        </button>
      </form>
    </div>
  );
}
