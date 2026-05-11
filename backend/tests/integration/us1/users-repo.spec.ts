import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startDb, type DbHarness } from '../_helpers/db.js';
import { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import { VerificationRepository } from '../../../src/auth/repositories/verification.repo.js';

let h: DbHarness;
let users: UsersRepository;
let verifications: VerificationRepository;

beforeAll(async () => {
  h = await startDb();
  await h.migrate();
  users = new UsersRepository(h.db);
  verifications = new VerificationRepository(h.db);
}, 90_000);

afterAll(async () => {
  await h.stop();
});

describe('UsersRepository + VerificationRepository roundtrip', () => {
  it('inserts a pending user and retrieves it case-insensitively', async () => {
    const u = await users.insertPending({ email: 'Alice@Example.COM', passwordHash: 'h' });
    expect(u.email).toBe('alice@example.com');
    const found = await users.findByEmail('alice@example.com');
    expect(found?.id).toBe(u.id);
    const upper = await users.findByEmail('ALICE@EXAMPLE.COM');
    expect(upper?.id).toBe(u.id);
  });

  it('enforces the partial unique index on live emails', async () => {
    await users.insertPending({ email: 'dup-repo@example.com', passwordHash: 'h' });
    await expect(
      users.insertPending({ email: 'dup-repo@example.com', passwordHash: 'h' }),
    ).rejects.toThrow();
  });

  it('cascades verification rows when a user is deleted', async () => {
    const u = await users.insertPending({ email: 'cascade@example.com', passwordHash: 'h' });
    await verifications.insertToken({
      userId: u.id,
      tokenHash: 'h'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await h.db.deleteFrom('auth.users').where('id', '=', u.id).execute();
    const orphans = await h.db
      .selectFrom('auth.email_verifications')
      .select(['id'])
      .where('user_id', '=', u.id)
      .execute();
    expect(orphans).toHaveLength(0);
  });

  it('marks a user verified', async () => {
    const u = await users.insertPending({ email: 'verify-me@example.com', passwordHash: 'h' });
    const now = new Date('2026-05-10T12:00:00Z');
    await users.markVerified(u.id, now);
    const after = await users.findById(u.id);
    expect(after?.status).toBe('active');
    expect(after?.verifiedAt?.toISOString()).toBe(now.toISOString());
  });
});
