import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './SearchSelect.module.css';

export interface SearchSelectItem {
  value: string;
  label: string;
  sublabel?: string;
  search?: string;
}

interface Option {
  value: string | null;
  label: string;
  sublabel?: string;
}

interface SearchSelectProps {
  items: SearchSelectItem[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

const ESTIMATED_DROP_H = 300;

export function SearchSelect({
  items,
  value,
  onChange,
  placeholder = 'Выберите…',
  allowNone = false,
  disabled = false,
  ariaLabel,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; width: number; downTop: number; upBottom: number; up: boolean } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = items.find(it => it.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      it.label.toLowerCase().includes(q) ||
      (it.sublabel ?? '').toLowerCase().includes(q) ||
      (it.search ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const options = useMemo<Option[]>(() => {
    const opts: Option[] = filtered.map(it => ({ value: it.value, label: it.label, sublabel: it.sublabel }));
    if (allowNone) opts.unshift({ value: null, label: '— НЕТ —' });
    return opts;
  }, [filtered, allowNone]);

  const triggerText = selected
    ? selected.label
    : value !== null
      ? `#${value.slice(0, 8)}`
      : allowNone
        ? '— НЕТ —'
        : placeholder;

  function closeDropdown() {
    setOpen(false);
  }

  function measure() {
    const btn = triggerRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 6;
    const spaceAbove = r.top - 6;
    const up = spaceBelow < ESTIMATED_DROP_H && spaceAbove > spaceBelow;
    setPlacement({
      left: r.left,
      width: r.width,
      downTop: r.bottom + 4,
      upBottom: window.innerHeight - r.top + 4,
      up,
    });
  }

  function toggle() {
    if (disabled) return;
    if (open) {
      closeDropdown();
    } else {
      setQuery('');
      setActive(0);
      setPlacement(null);
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    measure();
    searchRef.current?.focus();

    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeDropdown();
    }
    function onWindowChange(e: Event) {
      if (e.target instanceof Node && rootRef.current && rootRef.current.contains(e.target)) return;
      closeDropdown();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(v: string | null) {
    if (disabled) return;
    onChange(v);
    closeDropdown();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[Math.min(active, options.length - 1)];
      if (opt) choose(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
    } else if (e.key === 'Tab') {
      closeDropdown();
    }
  }

  const label = ariaLabel ?? placeholder;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className={[styles.trigger, open ? styles.triggerOpen : ''].filter(Boolean).join(' ')}
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className={[styles.triggerText, value === null && !allowNone ? styles.placeholderText : ''].filter(Boolean).join(' ')}>
          {triggerText}
        </span>
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>

      {open && placement && (
        <div
          className={styles.dropdown}
          role="listbox"
          aria-label={label}
          style={placement.up
            ? { left: placement.left, width: placement.width, bottom: placement.upBottom }
            : { left: placement.left, width: placement.width, top: placement.downTop }}
        >
          <input
            ref={searchRef}
            className={styles.searchInput}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Поиск…"
            role="searchbox"
            aria-label="Поиск по списку"
            autoComplete="off"
          />
          <div className={styles.list} ref={listRef}>
            {options.map((opt, i) => (
              <div
                key={opt.value ?? '__none__'}
                role="option"
                aria-selected={value === opt.value}
                data-active={i === active}
                className={[styles.option, i === active ? styles.optionActive : '', opt.value === null ? styles.noneOption : ''].filter(Boolean).join(' ')}
                onClick={() => choose(opt.value)}
                onMouseEnter={() => setActive(i)}
              >
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.sublabel && <span className={styles.optionSub}>{opt.sublabel}</span>}
              </div>
            ))}
            {filtered.length === 0 && <div className={styles.empty}>Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}
