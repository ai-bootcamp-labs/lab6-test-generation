import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startDb, type DbHarness } from '../_helpers/db.js';
import { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import { PasswordResetRepository } from '../../../src/auth/repositories/reset.repo.js';

let h: DbHarness;
let users: UsersRepository;
let resets: PasswordResetRepository;

beforeAll(async () => {
  h = await startDb();
  await h.migrate();
  users = new UsersRepository(h.db);
  resets = new PasswordResetRepository(h.db);
}, 90_000);

afterAll(async () => {
  await h?.stop();
});

describe('PasswordResetRepository', () => {
  it('inserts and finds a token by hash', async () => {
    const u = await users.insertPending({ email: 'r1@example.com', passwordHash: 'h' });
    const rec = await resets.insertToken({
      userId: u.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const found = await resets.findByTokenHash('a'.repeat(64));
    expect(found?.id).toBe(rec.id);
    expect(found?.userId).toBe(u.id);
    expect(found?.usedAt).toBeNull();
  });

  it('marks a token used and is idempotent', async () => {
    const u = await users.insertPending({ email: 'r2@example.com', passwordHash: 'h' });
    const rec = await resets.insertToken({
      userId: u.id,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const t = new Date('2026-05-10T12:00:00Z');
    await resets.markUsed(rec.id, t);
    const after = await resets.findByTokenHash('b'.repeat(64));
    expect(after?.usedAt?.toISOString()).toBe(t.toISOString());
    await resets.markUsed(rec.id, new Date(t.getTime() + 60_000));
    const again = await resets.findByTokenHash('b'.repeat(64));
    expect(again?.usedAt?.toISOString()).toBe(t.toISOString());
  });

  it('invalidates all outstanding tokens for a user', async () => {
    const u = await users.insertPending({ email: 'r3@example.com', passwordHash: 'h' });
    await resets.insertToken({
      userId: u.id,
      tokenHash: 'c'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await resets.insertToken({
      userId: u.id,
      tokenHash: 'd'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await resets.invalidateAllForUser(u.id, new Date());
    const c = await resets.findByTokenHash('c'.repeat(64));
    const d = await resets.findByTokenHash('d'.repeat(64));
    expect(c?.usedAt).not.toBeNull();
    expect(d?.usedAt).not.toBeNull();
  });

  it('cascades on user deletion', async () => {
    const u = await users.insertPending({ email: 'r4@example.com', passwordHash: 'h' });
    await resets.insertToken({
      userId: u.id,
      tokenHash: 'e'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await h.db.deleteFrom('auth.users').where('id', '=', u.id).execute();
    const orphan = await resets.findByTokenHash('e'.repeat(64));
    expect(orphan).toBeNull();
  });
});
