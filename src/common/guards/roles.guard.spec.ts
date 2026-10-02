import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  // Reflector.getAllAndOverride dipanggil 2x per canActivate (IS_PUBLIC_KEY, lalu ROLES_KEY).
  // Default: bukan public → kembalikan null untuk panggilan pertama, lalu nilai mock.
  const mockRolesGuard = (roles: string[] | null) =>
    vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(roles);

  const createMockContext = (user?: { role?: string }): ExecutionContext =>
    ({
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('mengizinkan akses jika tidak ada metadata @Roles()', () => {
    mockRolesGuard(null);
    const context = createMockContext({ role: 'RECEPTIONIST' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('mengizinkan akses jika role user cocok dengan salah satu role yang diizinkan', () => {
    mockRolesGuard(['MANAGER']);
    const context = createMockContext({ role: 'MANAGER' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('mengizinkan akses @Public() tanpa cek role', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const context = createMockContext(undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('menolak akses (ForbiddenException) jika role user tidak cocok', () => {
    mockRolesGuard(['MANAGER']);
    const context = createMockContext({ role: 'RECEPTIONIST' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('menolak akses (ForbiddenException) jika user tidak ada', () => {
    mockRolesGuard(['MANAGER']);
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
