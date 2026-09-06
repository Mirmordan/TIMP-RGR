import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../repositories/rbac.repository', () => ({
  rbacRepository: {
    findUsersWithRoles: vi.fn(),
    findUserWithRoles: vi.fn(),
    findRoles: vi.fn(),
    findGroups: vi.fn(),
    findGroupObjects: vi.fn(),
    findPermissions: vi.fn(),
    findPermissionsByRole: vi.fn(),
    findRoleById: vi.fn(),
    findRoleByName: vi.fn(),
    findRoleIdsByNames: vi.fn(),
    countAdminsExcluding: vi.fn(),
    setUserRoles: vi.fn(),
    createUserWithViewerRole: vi.fn(),
    setUserPasswordHash: vi.fn(),
    createRole: vi.fn(),
    renameRole: vi.fn(),
    deleteRole: vi.fn(),
    replaceRolePermissions: vi.fn(),
    findGroupById: vi.fn(),
    findGroupByName: vi.fn(),
    countGroupUsage: vi.fn(),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    deleteGroup: vi.fn(),
    replaceGroupObjects: vi.fn(),
    findExistingGroupIds: vi.fn(),
    findExistingObjectIds: vi.fn(),
  },
}));

vi.mock('../security/acl', () => ({
  invalidateUser: vi.fn(),
  invalidateObject: vi.fn(),
  invalidateGroup: vi.fn(),
}));

vi.mock('../repositories/user.repository', () => ({
  userRepository: {
    deleteById: vi.fn(),
    findByUsername: vi.fn(),
    findByEmail: vi.fn(),
  },
}));

vi.mock('./audit.service', () => ({
  auditService: { logAudit: vi.fn() },
}));

import { rbacRepository } from '../repositories/rbac.repository';
import { invalidateUser, invalidateGroup } from '../security/acl';
import { userRepository } from '../repositories/user.repository';
import { auditService } from './audit.service';
import { rbacService } from './rbac.service';
import { assertPassword } from '../security/auth.service';

const role = (id: string, name: string) => ({ id, name });
const user = (id: string, roles: Array<{ id: string; name: string }> = []) => ({
  id,
  username: 'alice',
  email: 'alice@example.test',
  createdAt: '2026-01-01T00:00:00.000Z',
  passwordSet: true,
  roles,
});

// Актор (req.user) для мутаций сервиса.
const ACTOR = { id: 'actor', username: 'alice' };

function expectHttpError(promise: Promise<unknown>, status: number): Promise<void> {
  return expect(promise).rejects.toMatchObject({ status });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('rbacService.setUserRoles', () => {
  it('самому себе роли менять нельзя → 400', async () => {
    await expectHttpError(
      rbacService.setUserRoles('me', { id: 'me', username: 'alice' }, ['viewer']),
      400,
    );
    expect(rbacRepository.findUserWithRoles).not.toHaveBeenCalled();
  });

  it('неизвестная роль → 400', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(
      user('t1', [role('rv', 'viewer')]),
    );
    (rbacRepository.findRoleIdsByNames as unknown as Mock).mockResolvedValue([
      { id: 'rv', name: 'viewer' },
    ]);
    await expectHttpError(rbacService.setUserRoles('t1', ACTOR, ['viewer', 'ghost']), 400);
    expect(rbacRepository.setUserRoles).not.toHaveBeenCalled();
  });

  it('снятие admin с последнего администратора → 400', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(
      user('t2', [role('ra', 'admin')]),
    );
    (rbacRepository.findRoleIdsByNames as unknown as Mock).mockResolvedValue([
      { id: 'rv', name: 'viewer' },
    ]);
    (rbacRepository.countAdminsExcluding as unknown as Mock).mockResolvedValue(0);
    await expectHttpError(rbacService.setUserRoles('t2', ACTOR, ['viewer']), 400);
    expect(rbacRepository.setUserRoles).not.toHaveBeenCalled();
  });

  it('happy path: роли записаны, кеш юзера инвалидирован', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock)
      .mockResolvedValueOnce(user('t3', [role('rv', 'viewer')]))
      .mockResolvedValueOnce(user('t3', [role('rv', 'viewer'), role('ro', 'operator')]));
    (rbacRepository.findRoleIdsByNames as unknown as Mock).mockResolvedValue([
      { id: 'ro', name: 'operator' },
    ]);
    (rbacRepository.setUserRoles as unknown as Mock).mockResolvedValue(undefined);

    const updated = await rbacService.setUserRoles('t3', ACTOR, ['operator']);

    expect(rbacRepository.setUserRoles).toHaveBeenCalledWith('t3', ['ro']);
    expect(invalidateUser).toHaveBeenCalledWith('t3');
    expect(updated.roles).toHaveLength(2);
  });

  it('после успешной записи пишется аудит action=user.roles.set', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock)
      .mockResolvedValueOnce(user('t4', [role('rv', 'viewer')]))
      .mockResolvedValueOnce(user('t4', [role('rv', 'viewer'), role('ro', 'operator')]));
    (rbacRepository.findRoleIdsByNames as unknown as Mock).mockResolvedValue([
      { id: 'ro', name: 'operator' },
    ]);
    (rbacRepository.setUserRoles as unknown as Mock).mockResolvedValue(undefined);

    await rbacService.setUserRoles('t4', ACTOR, ['operator']);

    const logAudit = auditService.logAudit as unknown as Mock;
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.roles.set',
        targetType: 'user',
        targetId: 't4',
        actorId: 'actor',
        actorName: 'alice',
        details: { roleNames: ['operator'] },
      }),
    );
  });
});

describe('rbacService.deleteRole', () => {
  it('роль не найдена → 404', async () => {
    (rbacRepository.findRoleById as unknown as Mock).mockResolvedValue(null);
    await expectHttpError(rbacService.deleteRole('r-missing', ACTOR), 404);
  });

  it('системную роль удалять нельзя → 400', async () => {
    (rbacRepository.findRoleById as unknown as Mock).mockResolvedValue(role('r1', 'admin'));
    await expectHttpError(rbacService.deleteRole('r1', ACTOR), 400);
    expect(rbacRepository.deleteRole).not.toHaveBeenCalled();
  });

  it('happy path: инвалидируются затронутые юзеры и группы', async () => {
    (rbacRepository.findRoleById as unknown as Mock).mockResolvedValue(role('r2', 'custom-role'));
    (rbacRepository.deleteRole as unknown as Mock).mockResolvedValue({
      userIds: ['u1'],
      groupIds: ['g1'],
    });

    await rbacService.deleteRole('r2', ACTOR);

    expect(invalidateUser).toHaveBeenCalledWith('u1');
    expect(invalidateGroup).toHaveBeenCalledWith('g1');
  });
});

describe('rbacService.deleteUser', () => {
  it('самого себя удалять нельзя → 400', async () => {
    await expectHttpError(
      rbacService.deleteUser('me', { id: 'me', username: 'alice' }),
      400,
    );
  });

  it('пользователь не найден → 404', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(null);
    await expectHttpError(rbacService.deleteUser('x', ACTOR), 404);
  });

  it('последнего администратора удалять нельзя → 400', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(
      user('adm', [role('ra', 'admin')]),
    );
    (rbacRepository.countAdminsExcluding as unknown as Mock).mockResolvedValue(0);
    await expectHttpError(rbacService.deleteUser('adm', ACTOR), 400);
    expect(userRepository.deleteById).not.toHaveBeenCalled();
  });

  it('happy path: deleteById + invalidateUser + аудит', async () => {
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(user('del'));
    (userRepository.deleteById as unknown as Mock).mockResolvedValue(true);

    await rbacService.deleteUser('del', ACTOR);

    expect(userRepository.deleteById).toHaveBeenCalledWith('del');
    expect(invalidateUser).toHaveBeenCalledWith('del');
    const logAudit = auditService.logAudit as unknown as Mock;
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.delete',
        targetType: 'user',
        targetId: 'del',
        details: { username: 'alice' },
      }),
    );
  });
});

describe('rbacService.createUser (парольная политика)', () => {
  function mockNoClashes() {
    (userRepository.findByUsername as unknown as Mock).mockResolvedValue(null);
    (userRepository.findByEmail as unknown as Mock).mockResolvedValue(null);
  }

  it('без password генерируется временный пароль: 24 символа и валиден assertPassword', async () => {
    mockNoClashes();
    (rbacRepository.createUserWithViewerRole as unknown as Mock).mockResolvedValue('u-new');
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(
      user('u-new', [role('rv', 'viewer')]),
    );

    const result = await rbacService.createUser(
      { username: 'newuser', email: 'new@example.test' },
      ACTOR,
    );

    expect(result.initialPassword).toBeDefined();
    expect(result.initialPassword).toHaveLength(24);
    expect(() => assertPassword(result.initialPassword as string)).not.toThrow();
    expect(rbacRepository.createUserWithViewerRole).toHaveBeenCalledWith({
      username: 'newuser',
      email: 'new@example.test',
      passwordHash: expect.any(String),
    });
  });

  it('явный пароль короче 12 символов отбивается → 400', async () => {
    mockNoClashes();
    await expect(
      rbacService.createUser(
        { username: 'newuser', email: 'new@example.test', password: '12345678' },
        ACTOR,
      ),
    ).rejects.toMatchObject({ status: 400, message: 'пароль минимум 12 символов' });
    expect(rbacRepository.createUserWithViewerRole).not.toHaveBeenCalled();
  });

  it('явный пароль от 12 символов принимается', async () => {
    mockNoClashes();
    (rbacRepository.createUserWithViewerRole as unknown as Mock).mockResolvedValue('u-new');
    (rbacRepository.findUserWithRoles as unknown as Mock).mockResolvedValue(
      user('u-new', [role('rv', 'viewer')]),
    );

    const result = await rbacService.createUser(
      { username: 'newuser', email: 'new@example.test', password: '123456789012' },
      ACTOR,
    );

    expect(result.initialPassword).toBeUndefined();
    expect(rbacRepository.createUserWithViewerRole).toHaveBeenCalledTimes(1);
  });
});
