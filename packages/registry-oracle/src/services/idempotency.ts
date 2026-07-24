import { createHash } from 'crypto'
import { AppDataSource } from '../database/dataSource'
import { IdempotencyRecordEntity } from '../entity/IdempotencyRecordEntity'

export class IdempotencyConflictError extends Error {}

interface IdempotentResult<T> {
  data: T
  statusCode: number
  replayed: boolean
}

function stableSerialize (value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  if (value !== null && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    const entries = Object.keys(objectValue)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableSerialize(objectValue[key])}`)
    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

function hashRequest (payload: unknown): string {
  return createHash('sha256').update(stableSerialize(payload)).digest('hex')
}

function parseStoredResult<T> (record: IdempotencyRecordEntity): IdempotentResult<T> {
  return {
    data: JSON.parse(record.response_body) as T,
    statusCode: record.status_code,
    replayed: true
  }
}

export async function executeIdempotently<T> (
  idempotencyKey: string,
  scope: string,
  payload: unknown,
  statusCode: number,
  operation: () => Promise<T>
): Promise<IdempotentResult<T>> {
  const repository = AppDataSource.getRepository(IdempotencyRecordEntity)
  const requestHash = hashRequest(payload)
  const existing = await repository.findOneBy({ idempotency_key: idempotencyKey })

  if (existing !== null) {
    if (existing.scope !== scope || existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError('Idempotency-Key was already used for a different request')
    }
    return parseStoredResult<T>(existing)
  }

  const data = await operation()
  const record = repository.create({
    idempotency_key: idempotencyKey,
    scope,
    request_hash: requestHash,
    response_body: JSON.stringify(data),
    status_code: statusCode
  })

  try {
    await repository.insert(record)
  } catch (error) {
    // Another identical request may have completed while this one was running.
    const concurrentRecord = await repository.findOneBy({ idempotency_key: idempotencyKey })
    if (concurrentRecord === null) throw error
    if (concurrentRecord.scope !== scope || concurrentRecord.request_hash !== requestHash) {
      throw new IdempotencyConflictError('Idempotency-Key was already used for a different request')
    }
    return parseStoredResult<T>(concurrentRecord)
  }

  return { data, statusCode, replayed: false }
}
