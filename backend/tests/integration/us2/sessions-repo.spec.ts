import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { startDb, type DbHarness } from '../_helpers/db.js';
import { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';

let h: DbHarness;
let users: UsersRepository;
let sessions: SessionsRepository;

beforeAll(async () => {
  h = await startDb();
  await h.migrate();
  users = new UsersRepository(h.db);
  sessions = new SessionsRepository(h.db);
}, 90_000);

afterAll(async () => {
  await h.stop();
});

describe('SessionsRepository', () => {
  it('inserts and finds a session by id', async () => {
    const u = await users.insertPending({ email: 'sess1@example.com', passwordHash: 'h' });
    const expiresAt = new Date(Date.now() + 60_000);
    const s = await sessions.insert({
      userId: u.id,
      csrfSecret: 'sec1',
      ip: '127.0.0.1',
      userAgent: 'jest',
      expiresAt,
    });
    const found = await sessions.findById(s.id);
    expect(found?.userId).toBe(u.id);
    expect(found?.csrfSecret).toBe('sec1');
    expect(found?.revokedAt).toBeNull();
  });

  it('revokes a session and is idempotent', async () => {
    const u = await users.insertPending({ email: 'sess2@example.com', passwordHash: 'h' });
    const s = await sessions.insert({
      userId: u.id,
      csrfSecret: 'sec2',
      ip: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const t = new Date('2026-05-10T12:00:00Z');
    await sessions.revoke(s.id, 'logout', t);
    const after = await sessions.findById(s.id);
    expect(after?.revokedAt?.toISOString()).toBe(t.toISOString());
    expect(after?.revokeReason).toBe('logout');
    // Second call should not overwrite revoked_at
    await sessions.revoke(s.id, 'admin_revoke', new Date(t.getTime() + 60_000));
    const again = await sessions.findById(s.id);
    expect(again?.revokeReason).toBe('logout');
  });

  it('revokes all live sessions for a user', async () => {
    const u = await users.insertPending({ email: 'sess3@example.com', passwordHash: 'h' });
    const expiresAt = new Date(Date.now() + 60_000);
    await sessions.insert({ userId: u.id, csrfSecret: 'a', ip: null, userAgent: null, expiresAt });
    await sessions.insert({ userId: u.id, csrfSecret: 'b', ip: null, userAgent: null, expiresAt });
    const s3 = await sessions.insert({
      userId: u.id,
      csrfSecret: 'c',
      ip: null,
      userAgent: null,
      expiresAt,
    });
    await sessions.revoke(s3.id, 'logout', new Date());
    const n = await sessions.revokeAllForUser(u.id, 'password_reset', new Date());
    expect(n).toBe(2);
  });

  it('purges expired sessions', async () => {
    const u = await users.insertPending({ email: 'sess4@example.com', passwordHash: 'h' });
    const past = new Date(Date.now() - 60_000);
    const s = await sessions.insert({
      userId: u.id,
      csrfSecret: 'x',
      ip: null,
      userAgent: null,
      expiresAt: past,
    });
    await sessions.purgeExpired(new Date());
    const after = await sessions.findById(s.id);
    expect(after?.revokeReason).toBe('expired');
  });
});
