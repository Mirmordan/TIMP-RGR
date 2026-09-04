import { LRUCache } from 'lru-cache';

/**
 * Небольшой in-memory кеш (LRU) для результатов ACL-запросов.
 * Права меняются редко — кеш снимает нагрузку и позволяет отдавать 403
 * "как можно выше", не ходя в БД на каждый запрос.
 *
 * Ключи намеренно типизированы строкой: каждый вид данных хранится
 * в собственном LRUCache, чтобы не смешивать типы значений.
 */

export class Cache<T extends {}> {
  private cache: LRUCache<string, T>;

  constructor(max = 1000, ttlMs = 60_000) {
    this.cache = new LRUCache<string, T>({ max, ttl: ttlMs });
  }

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: T): void {
    this.cache.set(key, value);
  }

  del(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
