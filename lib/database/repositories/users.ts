import { database, type Database } from '../client'
import { sql } from '../sql'
import { userColumns } from '../projections'
import { updateRecord } from '../records'
import type { User } from '../types'

export const users = {
  byPublicId: (publicId: string, connection = database) =>
    connection.one<User>(sql`SELECT ${userColumns} FROM users u WHERE u.public_id=${publicId}::uuid`),
  byId: (id: bigint, connection = database) =>
    connection.one<User>(sql`SELECT ${userColumns} FROM users u WHERE u.id=${id}`),
  ownerCandidates: (connection = database) =>
    connection.rows<User>(sql`SELECT ${userColumns} FROM users u ORDER BY u.id LIMIT 2`),
  async update(
    id: bigint,
    patch: Partial<Pick<User, 'name' | 'email' | 'phone' | 'avatar' | 'theme' | 'locale'>>,
    connection: Database = database,
  ) {
    await updateRecord(connection, 'users', id, {
      name: patch.name,
      email: patch.email,
      phone: patch.phone,
      avatar_url: patch.avatar,
      theme: patch.theme,
      locale: patch.locale,
    })
    const user = await users.byId(id, connection)
    if (!user) throw Object.assign(new Error('Owner no longer exists'), { code: 'P0002' })
    return user
  },
}
