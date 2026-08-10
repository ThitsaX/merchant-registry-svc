import { QueryFailedError } from 'typeorm'

export function isUniqueConstraintError (error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false

  const driverError = error.driverError as {
    code?: string
    errno?: number
    message?: string
  }
  return driverError.code === 'ER_DUP_ENTRY' ||
    driverError.errno === 1062 ||
    driverError.code === '23505' ||
    (
      driverError.code === 'SQLITE_CONSTRAINT' &&
      driverError.message?.includes('UNIQUE constraint failed') === true
    )
}
