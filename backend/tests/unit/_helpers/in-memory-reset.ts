import type { UserId } from '../../../src/auth/domain/user.js';
import type {
  PasswordResetRecord,
  PasswordResetRepository,
} from '../../../src/auth/repositories/reset.repo.js';
import { randomUUID } from 'node:crypto';

/**
 * In-memory replacement for `PasswordResetRepository` used by service-level
 * unit tests.
 */
export class InMemoryResetRepo implements Partial<PasswordResetRepository> {
  public rows: PasswordResetRecord[] = [];

  /** @inheritdoc */
  async insertToken(input: {
    userId: UserId;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord> {
    const rec: PasswordResetRecord = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      issuedAt: new Date(),
      usedAt: null,
    };
    this.rows.push(rec);
    return rec;
  }

  /** @inheritdoc */
  async findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }

  /** @inheritdoc */
  async markUsed(id: string, now: Date): Promise<void> {
    const r = this.rows.find((x) => x.id === id);
    if (r && r.usedAt === null) r.usedAt = now;
  }

  /** @inheritdoc */
  async invalidateAllForUser(userId: UserId, now: Date): Promise<void> {
    for (const r of this.rows) {
      if (r.userId === userId && r.usedAt === null) r.usedAt = now;
    }
  }
}
