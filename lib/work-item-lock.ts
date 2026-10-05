import { Prisma } from '@prisma/client'
import type { Prisma as PrismaTypes } from '@prisma/client'

type WorkItemLockTransaction = Pick<PrismaTypes.TransactionClient, '$queryRaw'>

export async function lockOwnedWorkItemForUpdate(
  transaction: WorkItemLockTransaction,
  workItemId: bigint,
  ownerId: bigint,
) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "work_items"
    WHERE "id" = ${workItemId} AND "assignee_id" = ${ownerId}
    FOR UPDATE
  `)
}
