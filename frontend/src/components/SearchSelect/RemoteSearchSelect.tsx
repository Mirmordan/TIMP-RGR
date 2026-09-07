import { useEffect, useRef, useState } from 'react';
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

interface RemoteSearchSelectProps {
  value: string | null;
  onChange: (v: string | null) => void;
  /**
   * Серверный поиск: query = строка поиска (пустая строка — дефолтный набор, топ-N).
   * Возвращает уже свёрстанные пункты (label/sublabel).
   */
  load: (query: string) => Promise<SearchSelectItem[]>;
  /** Подгрузка одного пункта по id — для отображения текущего выбора при старте. */
  loadSelected?: (id: string) => Promise<SearchSelectItem | null>;
  placeholder?: string;
  allowNone?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  debounceMs?: number;
}

const ESTIMATED_DROP_H = 300;
// Служебный маркер «ничего ещё не грузили» — чтобы первое открытие не дублировало запрос.
const NEVER_LOADED = '\u0000never\u0000';

export function RemoteSearchSelect({
  value,
  onChange,
  load,
  loadSelected,
  placeholder = 'Выберите…',
  allowNone = false,
  disabled = false,
  ariaLabel,
  debounceMs = 300,
}: RemoteSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<{ left: number; width: number; downTop: number; upBottom: number; up: boolean } | null>(null);
  const [items, setItems] = useState<SearchSelectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const lastQuery = useRef<string>(NEVER_LOADED);
  const resolvedFor = useRef<string | null>(null);

  const options: Option[] = items.map(it => ({ value: it.value, label: it.label, sublabel: it.sublabel }));

  function runSearch(q: string) {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError('');
    lastQuery.current = q;
    load(q)
      .then(list => {
        if (requestSeq.current !== seq) return;
        setItems(list);
      })
      .catch((e: unknown) => {
        if (requestSeq.current !== seq) return;
        setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
        setItems([]);
      })
      .finally(() => {
        if (requestSeq.current === seq) setLoading(false);
      });
  }

  // Открытие: сброс поиска, позиционирование и немедленная загрузка дефолтного набора.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    measure();
    searchRef.current?.focus();
    runSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Дебаунс-поиск по мере ввода (пустая строка = дефолтный набор).
  useEffect(() => {
    if (!open) return;
    if (lastQuery.current === NEVER_LOADED) return; // первичное открытие ещё идёт
    const trimmed = query.trim();
    if (trimmed === lastQuery.current) return;
    setLoading(true);
    setLoadError('');
    const seq = ++requestSeq.current;
    const t = window.setTimeout(() => {
      load(trimmed)
        .then(list => {
          if (requestSeq.current !== seq) return;
          lastQuery.current = trimmed;
          setItems(list);
        })
        .catch((e: unknown) => {
          if (requestSeq.current !== seq) return;
          setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить');
          setItems([]);
        })
        .finally(() => {
          if (requestSeq.current === seq) setLoading(false);
        });
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [query, open, load, debounceMs]);

  // При выборе/смене value — показываем подпись текущего пункта (label).
  useEffect(() => {
    if (value === null) {
      setSelectedLabel(null);
      resolvedFor.current = null;
      return;
    }
    if (resolvedFor.current === value) return;
    const known = items.find(it => it.value === value);
    if (known) {
      setSelectedLabel(known.label);
      resolvedFor.current = value;
      return;
    }
    if (!loadSelected) {
      setSelectedLabel(null);
      resolvedFor.current = value;
      return;
    }
    let cancelled = false;
    loadSelected(value)
      .then(item => {
        if (cancelled) return;
        setSelectedLabel(item ? item.label : null);
        resolvedFor.current = value;
      })
      .catch(() => { if (!cancelled) { setSelectedLabel(null); resolvedFor.current = value; } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, loadSelected]);

  const triggerText = value !== null
    ? (selectedLabel ?? `#${value.slice(0, 8)}`)
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
      setOpen(true);
    }
  }

  useEffect(() => {
    if (!open) return;

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
    const opt = options.find(o => o.value === v);
    setSelectedLabel(opt ? opt.label : null);
    resolvedFor.current = v;
    onChange(v);
    closeDropdown();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const total = options.length + (allowNone ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, Math.max(total - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (loading) return;
      const safeActive = Math.min(active, Math.max(total - 1, 0));
      const isNone = allowNone && safeActive === 0;
      const opt = isNone ? { value: null as string | null, label: '— НЕТ —' } : options[safeActive - (allowNone ? 1 : 0)];
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
            placeholder="Поиск по названию…"
            role="searchbox"
            aria-label="Поиск"
            autoComplete="off"
          />
          <div className={styles.list} ref={listRef}>
            {loading && !loadError && <div className={styles.empty}>Загрузка…</div>}
            {!loading && loadError && <div className={styles.empty}>{loadError}</div>}
            {!loading && !loadError && (
              <>
                {allowNone && (
                  <div
                    key="__none__"
                    role="option"
                    aria-selected={value === null}
                    data-active={active === 0}
                    className={[styles.option, active === 0 ? styles.optionActive : '', styles.noneOption].filter(Boolean).join(' ')}
                    onClick={() => choose(null)}
                    onMouseEnter={() => setActive(0)}
                  >
                    <span className={styles.optionLabel}>— НЕТ —</span>
                  </div>
                )}
                {options.map((opt, i) => {
                  const idx = i + (allowNone ? 1 : 0);
                  return (
                    <div
                      key={opt.value ?? '__none__'}
                      role="option"
                      aria-selected={value === opt.value}
                      data-active={idx === active}
                      className={[styles.option, idx === active ? styles.optionActive : ''].filter(Boolean).join(' ')}
                      onClick={() => choose(opt.value)}
                      onMouseEnter={() => setActive(idx)}
                    >
                      <span className={styles.optionLabel}>{opt.label}</span>
                      {opt.sublabel && <span className={styles.optionSub}>{opt.sublabel}</span>}
                    </div>
                  );
                })}
                {options.length === 0 && !allowNone && <div className={styles.empty}>Ничего не найдено</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
