import type { Session, SessionId } from '../../../src/auth/domain/session.js';
import type { UserId } from '../../../src/auth/domain/user.js';
import type { SessionsRepository } from '../../../src/auth/repositories/sessions.repo.js';
import type { RevokeReason } from '../../../src/auth/repositories/tables/us2.tables.js';
import { randomUUID } from 'node:crypto';

/**
 * In-memory replacement for `SessionsRepository` for service-level unit tests.
 */
export class InMemorySessionsRepo implements Partial<SessionsRepository> {
  public rows: Session[] = [];

  /** @inheritdoc */
  async insert(input: {
    userId: UserId;
    csrfSecret: string;
    ip: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<Session> {
    const now = new Date();
    const s: Session = {
      id: randomUUID() as SessionId,
      userId: input.userId,
      csrfSecret: input.csrfSecret,
      ip: input.ip,
      userAgent: input.userAgent,
      issuedAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      revokeReason: null,
    };
    this.rows.push(s);
    return s;
  }

  /** @inheritdoc */
  async findById(id: SessionId): Promise<Session | null> {
    return this.rows.find((s) => s.id === id) ?? null;
  }

  /** @inheritdoc */
  async revoke(id: SessionId, reason: RevokeReason, now: Date): Promise<void> {
    const s = this.rows.find((r) => r.id === id);
    if (s && s.revokedAt === null) {
      s.revokedAt = now;
      s.revokeReason = reason;
    }
  }

  /** @inheritdoc */
  async revokeAllForUser(userId: UserId, reason: RevokeReason, now: Date): Promise<number> {
    let n = 0;
    for (const s of this.rows) {
      if (s.userId === userId && s.revokedAt === null) {
        s.revokedAt = now;
        s.revokeReason = reason;
        n += 1;
      }
    }
    return n;
  }

  /** @inheritdoc */
  async purgeExpired(now: Date): Promise<void> {
    for (const s of this.rows) {
      if (s.revokedAt === null && s.expiresAt.getTime() < now.getTime()) {
        s.revokedAt = now;
        s.revokeReason = 'expired';
      }
    }
  }
}
