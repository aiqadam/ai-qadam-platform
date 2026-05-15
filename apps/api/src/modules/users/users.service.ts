import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { type User, users } from './schema';

interface UpsertInput {
  authentikSubject: string;
  email: string;
  displayName?: string;
}

@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsertByAuthentikSubject(input: UpsertInput): Promise<User> {
    if (input.authentikSubject.length === 0) {
      throw new Error('authentikSubject must be non-empty');
    }
    if (!input.email.includes('@')) {
      throw new Error('email must be an email address');
    }

    const now = new Date();
    const [row] = await this.db
      .insert(users)
      .values({
        authentikSubject: input.authentikSubject,
        email: input.email,
        displayName: input.displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.authentikSubject,
        set: {
          email: input.email,
          displayName: input.displayName ?? null,
          lastLoginAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new Error('users upsert returned no row');
    }
    return row;
  }

  async findByAuthentikSubject(sub: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.authentikSubject, sub))
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }
}
