import { describe, expect, it } from '@jest/globals';
import { hashToken } from '../../../src/auth/adapters/token.port.js';
import {
  VERIFICATION_LEEWAY_MS,
  VerificationService,
} from '../../../src/auth/services/verification.service.js';
import { VERIFICATION_TTL_MS } from '../../../src/auth/services/registration.service.js';
import { logger } from '../../../src/infra/logger.js';
import { FakeClock, FakeEmailAdapter } from '../_helpers/fakes.js';
import {
  InMemoryUsersRepo,
  InMemoryVerificationRepo,
} from '../_helpers/in-memory-repos.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type { VerificationRepository } from '../../../src/auth/repositories/verification.repo.js';

/** @returns Wired verification service + collaborators with one pending user already inserted. */
async function setup() {
  const users = new InMemoryUsersRepo();
  const verifications = new InMemoryVerificationRepo();
  const email = new FakeEmailAdapter();
  const clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
  const service = new VerificationService({
    users: users as unknown as UsersRepository,
    verifications: verifications as unknown as VerificationRepository,
    email,
    clock,
    logger,
    publicBaseUrl: 'http://test.local',
  });

  const user = await users.insertPending({ email: 'alice@example.com', passwordHash: 'hash' });
  const token = 'tok-' + Math.random().toString(36).slice(2, 18) + 'aaaaaaaa';
  await verifications.insertToken({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(clock.now().getTime() + VERIFICATION_TTL_MS),
  });
  return { service, users, verifications, email, clock, user, token };
}

describe('VerificationService.consumeToken', () => {
  it('flips the user to active and marks the token used on the happy path', async () => {
    const { service, users, verifications, user, token } = await setup();
    await service.consumeToken(token);
    expect(users.rows.find((u) => u.id === user.id)?.status).toBe('active');
    expect(verifications.rows[0]!.usedAt).not.toBeNull();
  });

  it('throws TokenAlreadyUsedError on second consumption', async () => {
    const { service, token } = await setup();
    await service.consumeToken(token);
    await expect(service.consumeToken(token)).rejects.toMatchObject({
      name: 'TokenAlreadyUsedError',
    });
  });

  it('throws TokenExpiredError once TTL + leeway has elapsed', async () => {
    const { service, clock, token } = await setup();
    clock.advance(VERIFICATION_TTL_MS + VERIFICATION_LEEWAY_MS + 1000);
    await expect(service.consumeToken(token)).rejects.toMatchObject({
      name: 'TokenExpiredError',
    });
  });

  it('accepts a token within the leeway window even if past nominal TTL', async () => {
    const { service, clock, token } = await setup();
    clock.advance(VERIFICATION_TTL_MS + 30_000); // 30s into leeway
    await expect(service.consumeToken(token)).resolves.toBeUndefined();
  });

  it('throws ValidationError when no row matches the token hash (tampered)', async () => {
    const { service } = await setup();
    await expect(service.consumeToken('totally-bogus-token-value-xyzpdq')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });
});

describe('VerificationService.resendVerification', () => {
  it('issues a new token and emails the user when a pending account exists', async () => {
    const { service, email, verifications } = await setup();
    email.reset();
    await service.resendVerification('alice@example.com');
    expect(email.sent).toHaveLength(1);
    // Original token now invalidated; new active token row exists.
    const live = verifications.rows.filter((r) => r.usedAt === null);
    expect(live).toHaveLength(1);
  });

  it('is a silent no-op for unknown emails (non-enumeration)', async () => {
    const { service, email } = await setup();
    email.reset();
    await service.resendVerification('unknown@example.com');
    expect(email.sent).toHaveLength(0);
  });
});
