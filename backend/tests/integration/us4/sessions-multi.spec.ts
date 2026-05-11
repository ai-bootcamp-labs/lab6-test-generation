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

describe('Multi-session and purgeExpired behaviour', () => {
  it('keeps concurrent sessions independent — revoking one leaves the other live', async () => {
    const u = await users.insertPending({ email: 'multi1@example.com', passwordHash: 'h' });
    const expiresAt = new Date(Date.now() + 60_000);
    const a = await sessions.insert({ userId: u.id, csrfSecret: 'a', ip: null, userAgent: null, expiresAt });
    const b = await sessions.insert({ userId: u.id, csrfSecret: 'b', ip: null, userAgent: null, expiresAt });
    await sessions.revoke(a.id, 'logout', new Date());
    const aAfter = await sessions.findById(a.id);
    const bAfter = await sessions.findById(b.id);
    expect(aAfter?.revokedAt).not.toBeNull();
    expect(bAfter?.revokedAt).toBeNull();
  });

  it('purgeExpired marks only expired-and-not-revoked rows as expired', async () => {
    const u = await users.insertPending({ email: 'multi2@example.com', passwordHash: 'h' });
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    const expired = await sessions.insert({
      userId: u.id,
      csrfSecret: 'x',
      ip: null,
      userAgent: null,
      expiresAt: past,
    });
    const live = await sessions.insert({
      userId: u.id,
      csrfSecret: 'y',
      ip: null,
      userAgent: null,
      expiresAt: future,
    });
    const alreadyRevoked = await sessions.insert({
      userId: u.id,
      csrfSecret: 'z',
      ip: null,
      userAgent: null,
      expiresAt: past,
    });
    await sessions.revoke(alreadyRevoked.id, 'logout', new Date(past.getTime() - 1000));

    await sessions.purgeExpired(new Date());

    const e = await sessions.findById(expired.id);
    const l = await sessions.findById(live.id);
    const r = await sessions.findById(alreadyRevoked.id);

    expect(e?.revokeReason).toBe('expired');
    expect(l?.revokedAt).toBeNull();
    expect(r?.revokeReason).toBe('logout');
  });
});
