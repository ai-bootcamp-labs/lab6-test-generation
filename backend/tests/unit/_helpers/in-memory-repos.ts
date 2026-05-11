import type { User, UserId } from '../../../src/auth/domain/user.js';
import type { UsersRepository } from '../../../src/auth/repositories/users.repo.js';
import type {
  VerificationRecord,
  VerificationRepository,
} from '../../../src/auth/repositories/verification.repo.js';
import { randomUUID } from 'node:crypto';

/**
 * In-memory replacement for `UsersRepository` used by service-level unit tests.
 * Implements the same shape but stores rows in an array.
 */
export class InMemoryUsersRepo implements Partial<UsersRepository> {
  public rows: User[] = [];

  /** @inheritdoc */
  async findByEmail(email: string): Promise<User | null> {
    return this.rows.find((u) => u.email === email.toLowerCase() && u.anonymizedAt === null) ?? null;
  }

  /** @inheritdoc */
  async findById(id: UserId): Promise<User | null> {
    return this.rows.find((u) => u.id === id) ?? null;
  }

  /** @inheritdoc */
  async insertPending(input: { email: string; passwordHash: string }): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID() as UserId,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      status: 'pending',
      verifiedAt: null,
      deletedAt: null,
      anonymizedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(user);
    return user;
  }

  /** @inheritdoc */
  async markVerified(id: UserId, now: Date): Promise<void> {
    const u = this.rows.find((r) => r.id === id);
    if (u) {
      u.status = 'active';
      u.verifiedAt = now;
      u.updatedAt = now;
    }
  }

  /** @inheritdoc */
  async existsByEmail(email: string): Promise<boolean> {
    return this.rows.some((u) => u.email === email.toLowerCase() && u.anonymizedAt === null);
  }

  /** @inheritdoc */
  async updatePasswordHash(id: UserId, passwordHash: string, now: Date): Promise<void> {
    const u = this.rows.find((r) => r.id === id);
    if (u) {
      u.passwordHash = passwordHash;
      u.updatedAt = now;
      if (u.status === 'pending') {
        u.status = 'active';
        u.verifiedAt = now;
      }
    }
  }

  /** @inheritdoc */
  async softDelete(id: UserId, now: Date): Promise<void> {
    const u = this.rows.find((r) => r.id === id);
    if (u) {
      u.status = 'disabled';
      u.deletedAt = now;
      u.updatedAt = now;
    }
  }

  /** @inheritdoc */
  async anonymizeDeletedOlderThan(olderThan: Date, now: Date): Promise<number> {
    let count = 0;
    for (const u of this.rows) {
      if (u.deletedAt && u.deletedAt < olderThan && u.anonymizedAt === null) {
        u.email = '';
        u.passwordHash = '';
        u.anonymizedAt = now;
        u.updatedAt = now;
        count += 1;
      }
    }
    return count;
  }
}

/**
 * In-memory verification-token repository for service-level unit tests.
 */
export class InMemoryVerificationRepo implements Partial<VerificationRepository> {
  public rows: VerificationRecord[] = [];

  /** @inheritdoc */
  async insertToken(input: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<VerificationRecord> {
    const rec: VerificationRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
    this.rows.push(rec);
    return rec;
  }

  /** @inheritdoc */
  async findByTokenHash(tokenHash: string): Promise<VerificationRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }

  /** @inheritdoc */
  async markUsed(id: string, now: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.usedAt = now;
  }

  /** @inheritdoc */
  async invalidateAllForUser(userId: UserId, now: Date): Promise<void> {
    for (const r of this.rows) {
      if (r.userId === userId && r.usedAt === null) r.usedAt = now;
    }
  }
}
