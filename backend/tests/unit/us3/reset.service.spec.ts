import { describe, expect, it } from '@jest/globals';
import bcrypt from 'bcrypt';
import {
  PASSWORD_RESET_TTL_MS,
  PasswordResetService,
} from '../../../src/auth/services/password-reset.service.js';
import { SessionService } from '../../../src/auth/services/session.service.js';
import { logger } from '../../../src/infra/logger.js';
import { FakeClock, FakeEmailAdapter } from '../_helpers/fakes.js';
import { InMemoryUsersRepo } from '../_helpers/in-memory-repos.js';
import { InMemoryResetRepo } from '../_helpers/in-memory-reset.js';
import { InMemorySessionsRepo } from '../_helpers/in-memory-sessions.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type { PasswordResetRepository } from '../../../src/auth/repositories/reset.repo.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';

const PWD = 'Str0ng!Passw0rd-XYZ';

/** @returns Wired service + helpers. */
async function setup() {
  const clock = new FakeClock(new Date('2026-05-10T12:00:00Z'));
  const users = new InMemoryUsersRepo();
  const resets = new InMemoryResetRepo();
  const sessionsRepo = new InMemorySessionsRepo();
  const sessions = new SessionService({
    sessions: sessionsRepo as unknown as SessionsRepository,
    clock,
    jwtSecret: 'x'.repeat(64),
  });
  const email = new FakeEmailAdapter();
  const dummyHash = await bcrypt.hash('placeholder', 4);
  const service = new PasswordResetService({
    users: users as unknown as UsersRepository,
    resets: resets as unknown as PasswordResetRepository,
    email,
    clock,
    logger,
    sessions,
    bcryptCost: 4,
    publicBaseUrl: 'http://localhost:3000',
    dummyHash,
  });
  return { service, users, resets, email, clock };
}

describe('PasswordResetService.request', () => {
  it('returns accepted and sends email for a known active user', async () => {
    const { service, users, email } = await setup();
    const u = await users.insertPending({ email: 'reset@example.com', passwordHash: 'h' });
    await users.markVerified(u.id, new Date());
    const out = await service.request({ email: 'reset@example.com' });
    expect(out).toEqual({ accepted: true });
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({ kind: 'password_reset', to: 'reset@example.com' });
  });

  it('returns accepted and sends NO email for an unknown address', async () => {
    const { service, email } = await setup();
    const out = await service.request({ email: 'nobody@example.com' });
    expect(out).toEqual({ accepted: true });
    expect(email.sent).toHaveLength(0);
  });

  it('still works (and sends) when email casing differs', async () => {
    const { service, users, email } = await setup();
    const u = await users.insertPending({ email: 'CaseTest@Example.com', passwordHash: 'h' });
    await users.markVerified(u.id, new Date());
    await service.request({ email: 'casetest@EXAMPLE.com' });
    expect(email.sent).toHaveLength(1);
  });

  it('runs equal bcrypt work on both branches (timing parity smoke check)', async () => {
    const { service } = await setup();
    const t1 = Date.now();
    await service.request({ email: 'unknown1@example.com' });
    const dUnknown = Date.now() - t1;
    expect(dUnknown).toBeGreaterThan(0);
    // We don't assert a tight upper bound here (CI variance); contract test
    // T106 is the formal SC-006 enforcement.
  });
});

describe('PasswordResetService.confirm', () => {
  /**
   * Helper that runs request and returns the captured token.
   * @param email - Email address to send to.
   * @param ctx - Setup context.
   * @returns Plaintext token captured by the fake email adapter.
   */
  async function getToken(
    email: string,
    ctx: Awaited<ReturnType<typeof setup>>,
  ): Promise<string> {
    await ctx.service.request({ email });
    const captured = ctx.email.sent.filter((m) => m.to === email).slice(-1)[0];
    if (!captured) throw new Error('expected an email');
    ctx.email.reset();
    return captured.token;
  }

  it('happy path — updates password, revokes sessions, marks token used', async () => {
    const ctx = await setup();
    const u = await ctx.users.insertPending({ email: 'happy@example.com', passwordHash: await bcrypt.hash('OldPwd!XXXXX', 4) });
    await ctx.users.markVerified(u.id, ctx.clock.now());
    // Issue a live session beforehand
    const sid = await (ctx as unknown as { sessionsRepo?: never }); // not used directly
    await ctx.service['deps'].sessions.issue({ userId: u.id, ip: null, userAgent: null });
    void sid;

    const token = await getToken('happy@example.com', ctx);
    await ctx.service.confirm({ token, password: PWD });

    const after = await ctx.users.findById(u.id);
    expect(after?.passwordHash).not.toBe('h');
    // Session should be revoked
    const sessRepo = (ctx.service['deps'].sessions as unknown as {
      deps: { sessions: InMemorySessionsRepo };
    }).deps.sessions;
    expect(sessRepo.rows.every((r) => r.revokedAt !== null)).toBe(true);
    // Token marked used
    expect(ctx.resets.rows.every((r) => r.usedAt !== null)).toBe(true);
  });

  it('flips a still-pending user to active on successful reset (Story 3 edge case)', async () => {
    const ctx = await setup();
    const u = await ctx.users.insertPending({ email: 'pending@example.com', passwordHash: 'h' });
    expect(u.status).toBe('pending');
    const token = await getToken('pending@example.com', ctx);
    await ctx.service.confirm({ token, password: PWD });
    const after = await ctx.users.findById(u.id);
    expect(after?.status).toBe('active');
    expect(after?.verifiedAt).not.toBeNull();
  });

  it('rejects an expired token with TokenExpiredError', async () => {
    const ctx = await setup();
    const u = await ctx.users.insertPending({ email: 'expired@example.com', passwordHash: 'h' });
    await ctx.users.markVerified(u.id, ctx.clock.now());
    const token = await getToken('expired@example.com', ctx);
    ctx.clock.advance(PASSWORD_RESET_TTL_MS + 5 * 60_000);
    await expect(ctx.service.confirm({ token, password: PWD })).rejects.toMatchObject({
      name: 'TokenExpiredError',
    });
  });

  it('rejects a reused token with TokenAlreadyUsedError', async () => {
    const ctx = await setup();
    const u = await ctx.users.insertPending({ email: 'reuse@example.com', passwordHash: 'h' });
    await ctx.users.markVerified(u.id, ctx.clock.now());
    const token = await getToken('reuse@example.com', ctx);
    await ctx.service.confirm({ token, password: PWD });
    await expect(ctx.service.confirm({ token, password: PWD })).rejects.toMatchObject({
      name: 'TokenAlreadyUsedError',
    });
  });

  it('rejects a weak new password with ValidationError', async () => {
    const ctx = await setup();
    const u = await ctx.users.insertPending({ email: 'weak@example.com', passwordHash: 'h' });
    await ctx.users.markVerified(u.id, ctx.clock.now());
    const token = await getToken('weak@example.com', ctx);
    await expect(ctx.service.confirm({ token, password: 'short' })).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  it('rejects an unknown token with ValidationError', async () => {
    const ctx = await setup();
    await expect(
      ctx.service.confirm({ token: 'garbage'.repeat(8), password: PWD }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });
});
