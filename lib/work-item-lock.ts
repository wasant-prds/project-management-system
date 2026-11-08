import { workItems } from '@/lib/database/repositories/work-items'
import type { Database } from '@/lib/database/client'

export async function lockOwnedWorkItemForUpdate(transaction: Database, workItemId: bigint, ownerId: bigint) {
  await workItems.lock(workItemId, ownerId, transaction)
}
