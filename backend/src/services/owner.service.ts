import { config } from '../config';
import { userRepository } from '../repositories/user.repository';
import { rbacRepository } from '../repositories/rbac.repository';
import { authService, assertEmail, assertPassword, assertUsername } from '../security/auth.service';
import { HttpError } from '../http/HttpError';

/**
 * Защищённый owner-аккаунт: обычный пользователь с ролью admin, чей username
 * совпадает с env OWNER_USERNAME. Отдельной колонки/роли нет — «владелец»
 * вычисляется сравнением username с конфигом. Bootstrap выполняется на старте
 * (ensureOwner), НИКОГДА не роняет сервер (весь код в try/catch).
 */

/** Зарезервировано ли username за владельцем (trim, non-empty, exact, case-sensitive). */
export function isReservedOwnerUsername(username: unknown): boolean {
  if (typeof username !== 'string') return false;
  const owner = config.owner.username;
  if (!owner) return false;
  const candidate = username.trim();
  return candidate !== '' && candidate === owner;
}

/** Бросает 403, если username зарезервирован за владельцем (менять/создавать нельзя). */
export function assertOwnerUsernameReserved(username: unknown): void {
  if (isReservedOwnerUsername(username)) throw new HttpError(403, 'имя владельца зарезервировано');
}

/** Является ли username владельцем (config.owner.username пуст → всегда false). */
export function isOwnerUsername(username: string): boolean {
  return isReservedOwnerUsername(username);
}

export const ownerService = {
  isOwner: isOwnerUsername,

  /**
   * Идемпотентный bootstrap owner на старте:
   *  - нет OWNER_USERNAME → warn и выход;
   *  - пользователя нет → создать с ролью admin (пароль из OWNER_PASSWORD);
   *  - пользователь есть, OWNER_PASSWORD_FORCE truthy → пересоздать пароль из env;
   *  - иначе существующего не трогать.
   */
  async ensureOwner(): Promise<void> {
    const { username, password, email, passwordForce } = config.owner;
    if (!username) {
      console.warn('[owner] OWNER_* не заданы, owner не инициализирован');
      return;
    }
    if (password) {
      try {
        assertPassword(password);
      } catch {
        console.warn(
          `[owner] OWNER_PASSWORD не проходит политику (минимум 12 символов) — owner «${username}» не инициализирован`,
        );
        return;
      }
    }
    try {
      const existing = await userRepository.findByUsername(username);
      if (!existing) {
        if (!password) {
          console.warn(`[owner] OWNER_PASSWORD не задан — owner «${username}» не создан`);
          return;
        }
        assertUsername(username);
        const ownerEmail = email || `${username}@owner.local`;
        assertEmail(ownerEmail);
        assertPassword(password);
        const passwordHash = await authService.hashPassword(password);
        await rbacRepository.createUserWithRoles({
          username,
          email: ownerEmail,
          passwordHash,
          roleNames: ['admin'],
        });
        console.log(`[owner] owner «${username}» создан (роль admin)`);
        return;
      }

      if (passwordForce) {
        if (!password) {
          console.warn(`[owner] OWNER_PASSWORD_FORCE включён, но OWNER_PASSWORD пуст — пароль «${username}» не меняю`);
          return;
        }
        assertPassword(password);
        const passwordHash = await authService.hashPassword(password);
        await rbacRepository.setUserPasswordHash(existing.id, passwordHash);
        console.log(`[owner] пароль owner «${username}» пересоздан из env (OWNER_PASSWORD_FORCE)`);
        return;
      }

      console.log(`[owner] owner «${username}» уже существует — не трогаем`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[owner] ошибка инициализации owner (сервер продолжает работу): ${msg}`);
    }
  },
};
