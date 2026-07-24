import { timingSafeEqual } from 'crypto'
import { type NextFunction, type Request, type Response } from 'express'
import { readEnv } from '../setup/readEnv'

const INTERNAL_API_KEY = readEnv('REGISTRY_INTERNAL_API_KEY', '') as string

function keysMatch (providedKey: string): boolean {
  if (INTERNAL_API_KEY.length === 0) return false
  const expected = Buffer.from(INTERNAL_API_KEY)
  const provided = Buffer.from(providedKey)
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}

export function authenticateInternal (req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.header('x-internal-api-key')
  if (apiKey === undefined || !keysMatch(apiKey)) {
    res.status(401).send({ message: 'Unauthorized' })
    return
  }
  next()
}
