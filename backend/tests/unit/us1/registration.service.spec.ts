import { describe, expect, it } from '@jest/globals';
import { RegistrationService } from '../../../src/auth/services/registration.service.js';
import { logger } from '../../../src/infra/logger.js';
import { FakeClock, FakeEmailAdapter } from '../_helpers/fakes.js';
import {
  InMemoryUsersRepo,
  InMemoryVerificationRepo,
} from '../_helpers/in-memory-repos.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type { VerificationRepository } from '../../../src/auth/repositories/verification.repo.js';

/**
 * Build a fresh service + collaborators for each test.
 * @returns Wired registration service and collaborators.
 */
function setup() {
  const users = new InMemoryUsersRepo();
  const verifications = new InMemoryVerificationRepo();
  const email = new FakeEmailAdapter();
  const clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
  const service = new RegistrationService({
    users: users as unknown as UsersRepository,
    verifications: verifications as unknown as VerificationRepository,
    email,
    clock,
    logger,
    bcryptCost: 4, // keep tests fast
    publicBaseUrl: 'http://test.local',
  });
  return { service, users, verifications, email, clock };
}

describe('RegistrationService.register', () => {
  it('creates a pending user, persists a bcrypt hash, and emails a verification token', async () => {
    const { service, users, verifications, email } = setup();
    const result = await service.register({ email: 'alice@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    expect(result).toEqual({ accepted: true });
    expect(users.rows).toHaveLength(1);
    const u = users.rows[0]!;
    expect(u.email).toBe('alice@example.com');
    expect(u.status).toBe('pending');
    expect(u.passwordHash.startsWith('$2')).toBe(true);
    expect(u.passwordHash).not.toContain('Str0ng');
    expect(verifications.rows).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.kind).toBe('verification');
  });

  it('rejects weak passwords with ValidationError', async () => {
    const { service } = setup();
    await expect(
      service.register({ email: 'alice@example.com', password: 'short1!' }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('returns identical generic accepted shape on duplicate email and sends NO new email', async () => {
    const { service, users, email } = setup();
    await service.register({ email: 'alice@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    email.reset();
    const result = await service.register({ email: 'alice@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    expect(result).toEqual({ accepted: true });
    expect(users.rows).toHaveLength(1); // no second insert
    expect(email.sent).toHaveLength(0);
  });

  it('still hashes the password on the duplicate path (timing parity guard)', async () => {
    const { service, users, email } = setup();
    await service.register({ email: 'alice@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    email.reset();
    const t0 = process.hrtime.bigint();
    await service.register({ email: 'alice@example.com', password: 'Str0ng!Passw0rd-XYZ' });
    const elapsedNs = process.hrtime.bigint() - t0;
    // bcrypt cost 4 takes ≥ 1ms; if the duplicate path skipped it the call would
    // complete in microseconds. 1 ms gives a generous floor that still detects
    // a missing hash.
    expect(elapsedNs).toBeGreaterThan(1_000_000n);
    expect(users.rows).toHaveLength(1);
  });
});
