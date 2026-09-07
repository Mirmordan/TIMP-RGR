/**
 * Нормализация общих метаданных объектов (objects.name/description).
 *
 * Потоки/процессы НАСЛЕДУЮТ название от родителя (устройство/поток):
 * objects.name хранит только ЯВНЫЙ override, NULL/'' означает наследование.
 * Description всегда собственное (унаследованного нет), ''/null = очистить.
 */

/** Общие метаданные для create/put: name = NULL означает «наследовать от родителя». */
export interface EntityMeta {
  name: string | null;
  description: string | null;
}

/** Поля PATCH-объекта метаданных: undefined = поле не трогаем, null = очистить. */
export interface EntityMetaPatch {
  name?: string | null;
  description?: string | null;
}

/** Пробелы/пусто → null (очистить override / очистить описание). */
export function normalizeMetaName(name: string | null | undefined): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' ? null : trimmed;
}

export function normalizeMetaDescription(description: string | null | undefined): string | null {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  return trimmed === '' ? null : trimmed;
}
