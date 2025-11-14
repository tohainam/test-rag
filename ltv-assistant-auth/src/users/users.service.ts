import { Injectable, Inject } from '@nestjs/common';
import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, or, like, sql, desc, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database.module';
import * as schema from '../database/schema';
import { User, UserRole } from '../database/schema';
import { GetUsersQueryDto } from './dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: MySql2Database<typeof schema>,
  ) {}

  async getUsers(query: GetUsersQueryDto) {
    const { page = 1, limit = 10, search, role, sortBy, sortOrder } = query;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: SQL[] = [];

    if (search) {
      const searchCondition = or(
        like(schema.users.name, `%${search}%`),
        like(schema.users.email, `%${search}%`),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (role) {
      conditions.push(eq(schema.users.role, role));
    }

    const whereClause =
      conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

    // Get total count
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.users)
      .where(whereClause);

    // Build order clause based on sort parameters
    let orderClause = desc(schema.users.createdAt);
    if (sortBy && sortOrder) {
      if (sortBy === 'name') {
        orderClause =
          sortOrder === 'asc'
            ? sql`${schema.users.name} ASC`
            : sql`${schema.users.name} DESC`;
      } else if (sortBy === 'email') {
        orderClause =
          sortOrder === 'asc'
            ? sql`${schema.users.email} ASC`
            : sql`${schema.users.email} DESC`;
      } else if (sortBy === 'role') {
        orderClause =
          sortOrder === 'asc'
            ? sql`${schema.users.role} ASC`
            : sql`${schema.users.role} DESC`;
      } else if (sortBy === 'createdAt') {
        orderClause =
          sortOrder === 'asc'
            ? sql`${schema.users.createdAt} ASC`
            : sql`${schema.users.createdAt} DESC`;
      }
    }

    // Get paginated users
    const users = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        avatar: schema.users.avatar,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .where(whereClause)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    return {
      data: users,
      meta: {
        page,
        limit,
        total: Number(count),
        totalPages: Math.ceil(Number(count) / limit),
      },
    };
  }

  async getUserById(id: number): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    return user || null;
  }

  async updateUserRole(id: number, role: UserRole) {
    await this.db
      .update(schema.users)
      .set({ role })
      .where(eq(schema.users.id, id));

    return this.getUserById(id);
  }

  // Alias for TCP compatibility
  async findById(id: number): Promise<User | null> {
    return this.getUserById(id);
  }

  // Find user by email
  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    return user || null;
  }

  // Search users by name or email
  async searchUsers(searchQuery: string) {
    const users = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        avatar: schema.users.avatar,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(
        or(
          like(schema.users.name, `%${searchQuery}%`),
          like(schema.users.email, `%${searchQuery}%`),
        ),
      )
      .limit(20);

    return users;
  }

  // Get users by IDs
  async getUsersByIds(ids: number[]) {
    if (ids.length === 0) {
      return [];
    }

    const users = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        avatar: schema.users.avatar,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(
        sql`${schema.users.id} IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    return users;
  }
}
