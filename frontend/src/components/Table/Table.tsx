import type { ReactNode } from 'react';
import styles from './Table.module.css';

export interface Column<T> {
  key: string;
  header: string;
  render?: (value: unknown, row: T) => ReactNode;
  mono?: boolean;
}

interface TableProps<T extends { id: string | number }> {
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
  onRowClick?: (row: T) => void;
}

export function Table<T extends { id: string | number }>({ columns, data, emptyText = 'Нет данных', onRowClick }: TableProps<T>) {
  if (data.length === 0) {
    return <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>{emptyText}</div>;
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>{columns.map(c => <th key={c.key}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr
            key={row.id}
            className={onRowClick ? styles.clickable : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            {columns.map(c => (
              <td key={c.key} className={c.mono ? styles.mono : undefined}>
                {c.render ? c.render((row as Record<string, unknown>)[c.key], row) : String((row as Record<string, unknown>)[c.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
