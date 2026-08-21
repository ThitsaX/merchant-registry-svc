import { AppDataSource } from '../database/dataSource'
import { MerchantEntity } from '../entity/MerchantEntity'
import { findMerchantLeiRegistrationsInRegistry } from './registryOracleClient'

export interface MerchantLeiDFSP {
  id: number | null
  name: string
  fspId: string
}

export interface MerchantLeiRegistration {
  merchantId: number
  lei: string
  dfsps: MerchantLeiDFSP[]
}

export function normalizeMerchantLei (value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function registrationFromMerchant (merchant: MerchantEntity): MerchantLeiRegistration {
  const allDfsps = [merchant.default_dfsp, ...(merchant.dfsps ?? [])]
    .filter(dfsp => dfsp !== null && dfsp !== undefined)
  const dfsps = [...new Map(allDfsps.map(dfsp => [dfsp.id, {
    id: dfsp.id,
    name: dfsp.name,
    fspId: dfsp.fspId
  }])).values()]

  return {
    merchantId: merchant.id,
    lei: normalizeMerchantLei(merchant.lei_normalized ?? merchant.lei),
    dfsps
  }
}

export async function findMerchantLeiRegistrations (
  values: unknown[],
  excludedMerchantId?: number
): Promise<Map<string, MerchantLeiRegistration>> {
  const leis = [...new Set(values.map(normalizeMerchantLei).filter(lei => lei.length > 0))]
  if (leis.length === 0) return new Map()

  const query = AppDataSource.getRepository(MerchantEntity)
    .createQueryBuilder('merchant')
    .addSelect('merchant.lei_normalized')
    .leftJoinAndSelect('merchant.default_dfsp', 'default_dfsp')
    .leftJoinAndSelect('merchant.dfsps', 'dfsps')
    .where(
      '(merchant.lei_normalized IN (:...leis) OR UPPER(TRIM(merchant.lei)) IN (:...leis))',
      { leis }
    )

  if (excludedMerchantId !== undefined) {
    query.andWhere('merchant.id != :excludedMerchantId', { excludedMerchantId })
  }

  const registrations = new Map<string, MerchantLeiRegistration>()
  for (const merchant of await query.getMany()) {
    const registration = registrationFromMerchant(merchant)
    registrations.set(registration.lei, registration)
  }
  return registrations
}

export async function findMerchantLeiRegistration (
  value: unknown,
  excludedMerchantId?: number
): Promise<MerchantLeiRegistration | null> {
  const lei = normalizeMerchantLei(value)
  if (lei.length === 0) return null
  return (await findMerchantLeiRegistrations([lei], excludedMerchantId)).get(lei) ?? null
}

export async function findGlobalMerchantLeiRegistrations (
  values: unknown[],
  excludedMerchantId?: number
): Promise<Map<string, MerchantLeiRegistration>> {
  const leis = [...new Set(values.map(normalizeMerchantLei).filter(lei => lei.length > 0))]
  const registrations = await findMerchantLeiRegistrations(leis, excludedMerchantId)
  const oracleRegistrations = await findMerchantLeiRegistrationsInRegistry(leis)

  for (const oracleRegistration of oracleRegistrations) {
    const lei = normalizeMerchantLei(oracleRegistration.lei)
    const existing = registrations.get(lei)
    const oracleDfsp: MerchantLeiDFSP = {
      id: null,
      name: oracleRegistration.dfsp_name,
      fspId: oracleRegistration.fspId
    }
    if (existing === undefined) {
      registrations.set(lei, {
        merchantId: oracleRegistration.merchant_id,
        lei,
        dfsps: [oracleDfsp]
      })
      continue
    }
    if (!existing.dfsps.some(dfsp => dfsp.fspId === oracleDfsp.fspId)) {
      existing.dfsps.push(oracleDfsp)
    }
  }
  return registrations
}

export async function findGlobalMerchantLeiRegistration (
  value: unknown,
  excludedMerchantId?: number
): Promise<MerchantLeiRegistration | null> {
  const lei = normalizeMerchantLei(value)
  if (lei.length === 0) return null
  return (await findGlobalMerchantLeiRegistrations([lei], excludedMerchantId)).get(lei) ?? null
}

function dfspDescription (registration: MerchantLeiRegistration): string {
  if (registration.dfsps.length === 0) return 'an unknown DFSP'
  return registration.dfsps
    .map(dfsp => `DFSP "${dfsp.name}" (${dfsp.fspId})`)
    .join(', ')
}

export function merchantLeiConflictMessage (
  registration: MerchantLeiRegistration
): string {
  return `LEI "${registration.lei}" is already registered with ${dfspDescription(registration)}`
}

export function merchantLeiConflictResponse (
  registration: MerchantLeiRegistration
): {
    message: string
    field: 'lei'
    registered_dfsps: Array<{ id: number | null, name: string, fsp_id: string }>
  } {
  return {
    message: merchantLeiConflictMessage(registration),
    field: 'lei',
    registered_dfsps: registration.dfsps.map(dfsp => ({
      id: dfsp.id,
      name: dfsp.name,
      fsp_id: dfsp.fspId
    }))
  }
}

export function isMerchantLeiUniqueConstraintError (error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const message = String(
    (error as { message?: unknown }).message ??
    (error as { driverError?: { message?: unknown } }).driverError?.message ??
    ''
  )
  return message.includes('UQ_merchants_lei_normalized') ||
    message.includes('merchants.lei_normalized')
}
