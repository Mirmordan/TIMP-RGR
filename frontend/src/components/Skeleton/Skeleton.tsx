import type { CSSProperties } from 'react'
import styles from './Skeleton.module.css'

export interface SkeletonProps {
  className?: string
  width?: number | string
  height?: number | string
  style?: CSSProperties
}

export function Skeleton({ className, width, height, style }: SkeletonProps) {
  const resolved: CSSProperties = { ...style }
  if (width !== undefined) {
    resolved.width = typeof width === 'number' ? `${width}px` : width
  }
  if (height !== undefined) {
    resolved.height = typeof height === 'number' ? `${height}px` : height
  }
  return (
    <span
      aria-hidden="true"
      className={[styles.base, className].filter(Boolean).join(' ')}
      style={resolved}
    />
  )
}

export interface SkeletonRowsProps {
  /** Количество строк. */
  rows?: number
  /** Количество колонок, либо 'auto' — одна полоса на всю ширину строки. */
  cols?: number | 'auto'
  /** Ширины полос колонок (переопределяют узор по умолчанию). */
  cellWidths?: string[]
  className?: string
}

const DEFAULT_CELL_WIDTHS = [
  '52%', '70%', '30%', '44%', '26%', '60%', '36%', '50%', '28%', '40%',
]

export function SkeletonRows({ rows = 5, cols = 'auto', cellWidths, className }: SkeletonRowsProps) {
  const rowCount = Math.max(0, rows)

  if (cols === 'auto') {
    return (
      <div aria-hidden="true" className={[styles.auto, className].filter(Boolean).join(' ')}>
        {Array.from({ length: rowCount }, (_, r) => (
          <Skeleton key={r} width="100%" className={styles.barLine} />
        ))}
      </div>
    )
  }

  const columnCount = Math.max(0, cols)
  return (
    <div aria-hidden="true" className={[styles.rows, className].filter(Boolean).join(' ')}>
      {Array.from({ length: rowCount }, (_, r) => (
        <div key={r} className={styles.row}>
          {Array.from({ length: columnCount }, (_, c) => (
            <div key={c} className={styles.cell}>
              <Skeleton
                className={styles.barCell}
                width={cellWidths?.[c] ?? DEFAULT_CELL_WIDTHS[c % DEFAULT_CELL_WIDTHS.length]}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
