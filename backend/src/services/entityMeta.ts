/**
 * Нормализация общих метаданных объектов (objects.name/description).
 *
 * Название и описание — СОБСТВЕННЫЕ поля объекта (как у инцидентов):
 * device/stream/process/incident хранят name прямо в objects, наследование
 * от родителя по parent_id упразднено. Название обязательно для user-facing
 * сущностей (device/stream/process) — пустое значение недопустимо.
 * Description всегда необязательный (''/null = очистить).
 */

/** Общие метаданные для create/put. */
export interface EntityMeta {
  name: string | null;
  description: string | null;
}

/** Поля PATCH-объекта метаданных: undefined = поле не трогаем, null = очистить. */
export interface EntityMetaPatch {
  name?: string | null;
  description?: string | null;
}

/** Пробелы/пусто → null. */
export function normalizeMetaName(name: string | null | undefined): string | null {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed === '' ? null : trimmed;
}

export function normalizeMetaDescription(description: string | null | undefined): string | null {
  const trimmed = typeof description === 'string' ? description.trim() : '';
  return trimmed === '' ? null : trimmed;
}

/** Название обязательно (device/stream/process): пусто → ошибка валидации. */
export function requireMetaName(name: string | null | undefined): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') throw new Error('название обязательно');
  return trimmed;
}
