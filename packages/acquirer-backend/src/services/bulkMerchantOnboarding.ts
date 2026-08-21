import { createHash } from 'crypto'
import {
  AuditActionType,
  AuditTrasactionStatus,
  MerchantAllowBlockStatus,
  MerchantRegistrationStatus
} from 'shared-lib'
import { QueryFailedError, type DeepPartial } from 'typeorm'
import { AppDataSource } from '../database/dataSource'
import { AuditEntity } from '../entity/AuditEntity'
import { BusinessLicenseEntity } from '../entity/BusinessLicenseEntity'
import { BusinessOwnerEntity } from '../entity/BusinessOwnerEntity'
import { BusinessPersonLocationEntity } from '../entity/BusinessPersonLocationEntity'
import { CheckoutCounterEntity } from '../entity/CheckoutCounterEntity'
import { ContactPersonEntity } from '../entity/ContactPersonEntity'
import { MerchantBulkImportEntity } from '../entity/MerchantBulkImportEntity'
import { MerchantEntity } from '../entity/MerchantEntity'
import { MerchantLocationEntity } from '../entity/MerchantLocationEntity'
import { type PortalUserEntity } from '../entity/PortalUserEntity'
import { gleifService } from './GLEIFService'
import { isRequestedMerchantAliasAvailable } from './merchantAlias'
import {
  findGlobalMerchantLeiRegistrations,
  isMerchantLeiUniqueConstraintError,
  merchantLeiConflictMessage,
  normalizeMerchantLei
} from './merchantLei'
import {
  type BulkCounterRow,
  type BulkMerchantRow,
  type BulkMerchantWorkbookData,
  type BulkWorkbookIssue
} from '../utils/merchantBulkWorkbook'

export interface BulkMerchantImportResult {
  import_id: number
  merchants_created: number
  locations_created: number
  checkout_counters_created: number
  business_owners_created: number
  contact_persons_created: number
  merchant_ids: Array<{
    merchant_reference: string
    merchant_id: number
  }>
  idempotent_replay?: boolean
}

export class BulkMerchantValidationError extends Error {
  constructor (public readonly issues: BulkWorkbookIssue[]) {
    super('Workbook validation failed')
  }
}

export class BulkMerchantIdempotencyConflictError extends Error {}
export class BulkMerchantDependencyError extends Error {}

function hash (value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function effectiveCounterAlias (
  merchant: BulkMerchantRow,
  counter: BulkCounterRow,
  counterIndex: number
): string | null {
  if (counterIndex === 0 && (merchant.payinto_alias ?? '') !== '') {
    return merchant.payinto_alias as string
  }
  return (counter.alias_value ?? '') === '' ? null : counter.alias_value as string
}

async function validateExternalData (data: BulkMerchantWorkbookData): Promise<void> {
  const issues: BulkWorkbookIssue[] = []
  let existingLeiRegistrations: Awaited<ReturnType<typeof findGlobalMerchantLeiRegistrations>>
  try {
    existingLeiRegistrations = await findGlobalMerchantLeiRegistrations(
      data.merchants.map(merchant => merchant.lei)
    )
  } catch {
    throw new BulkMerchantDependencyError(
      'Unable to verify merchant LEI availability. Please try again.'
    )
  }

  for (const merchant of data.merchants) {
    const existingLeiRegistration = existingLeiRegistrations.get(merchant.lei)
    if (existingLeiRegistration !== undefined) {
      issues.push({
        sheet: 'Merchants',
        row: merchant.rowNumber,
        field: 'lei',
        message: merchantLeiConflictMessage(existingLeiRegistration)
      })
      continue
    }

    if (merchant.lei.length > 0) {
      const result = await gleifService.validateLEI(
        merchant.lei,
        merchant.dba_trading_name
      )
      if (!result.isValid) {
        issues.push({
          sheet: 'Merchants',
          row: merchant.rowNumber,
          field: 'lei',
          message: result.error ?? 'LEI validation failed'
        })
        continue
      }

      const locations = data.locations.filter(
        location => location.merchant_reference === merchant.merchant_reference
      )
      for (const location of locations) {
        const locationResult = await gleifService.validateLocation(
          merchant.lei,
          location.street_name ?? '',
          location.building_number ?? '',
          location.postal_code ?? '',
          location.town_name,
          location.country_subdivision ?? '',
          location.country,
          location.address_line ?? ''
        )
        if (!locationResult.isValid) {
          issues.push({
            sheet: 'Locations',
            row: location.rowNumber,
            field: 'address_line',
            message: locationResult.error ?? 'GLEIF location validation failed'
          })
        }
      }
    }

    const counters = data.checkoutCounters.filter(
      counter => counter.merchant_reference === merchant.merchant_reference
    )
    for (const [counterIndex, counter] of counters.entries()) {
      const alias = effectiveCounterAlias(merchant, counter, counterIndex)
      if (alias === null) continue
      try {
        if (!await isRequestedMerchantAliasAvailable(alias)) {
          issues.push({
            sheet: counterIndex === 0 && (merchant.payinto_alias ?? '') !== ''
              ? 'Merchants'
              : 'Checkout Counters',
            row: counterIndex === 0 && (merchant.payinto_alias ?? '') !== ''
              ? merchant.rowNumber
              : counter.rowNumber,
            field: counterIndex === 0 && (merchant.payinto_alias ?? '') !== ''
              ? 'payinto_alias'
              : 'alias_value',
            message: `Alias "${alias}" is already registered`
          })
        }
      } catch {
        throw new BulkMerchantDependencyError(
          'Unable to verify merchant alias availability. Please try again.'
        )
      }
    }
  }

  if (issues.length > 0) throw new BulkMerchantValidationError(issues)
}

function withoutSourceRow<T extends { rowNumber: number }> (row: T): Omit<T, 'rowNumber'> {
  const { rowNumber: _rowNumber, ...data } = row
  return data
}

async function createMerchants (
  data: BulkMerchantWorkbookData,
  portalUser: PortalUserEntity,
  keyHash: string,
  requestHash: string
): Promise<BulkMerchantImportResult> {
  return await AppDataSource.transaction(async manager => {
    const importRecord = manager.create(MerchantBulkImportEntity, {
      key_hash: keyHash,
      request_hash: requestHash,
      result: {}
    })
    await manager.save(MerchantBulkImportEntity, importRecord)

    const merchantIds: BulkMerchantImportResult['merchant_ids'] = []
    for (const merchantRow of data.merchants) {
      const merchantData: DeepPartial<MerchantEntity> = {
        dba_trading_name: merchantRow.dba_trading_name,
        registered_name: merchantRow.registered_name ?? '',
        lei: merchantRow.lei.length > 0 ? normalizeMerchantLei(merchantRow.lei) : null,
        lei_normalized: merchantRow.lei.length > 0 ? normalizeMerchantLei(merchantRow.lei) : null,
        employees_num: merchantRow.employees_num,
        monthly_turnover: merchantRow.monthly_turnover ?? '',
        currency_code: merchantRow.currency_code as any,
        category_code: merchantRow.category_code as any,
        mcc: merchantRow.mcc,
        merchant_type: merchantRow.merchant_type,
        registration_status: MerchantRegistrationStatus.REVIEW,
        registration_status_reason: `Bulk uploaded for review by ${portalUser.email}`,
        allow_block_status: MerchantAllowBlockStatus.PENDING,
        dfsps: [portalUser.dfsp],
        default_dfsp: portalUser.dfsp,
        created_by: portalUser,
        gleif_verified_at: merchantRow.lei.length > 0 ? new Date() : null
      }
      const merchant = manager.create(MerchantEntity, merchantData)
      await manager.save(MerchantEntity, merchant)

      const license = manager.create(BusinessLicenseEntity, {
        license_number: merchantRow.license_number ?? '',
        license_document_link: '',
        merchant
      })
      await manager.save(BusinessLicenseEntity, license)

      const locationRows = data.locations.filter(
        location => location.merchant_reference === merchantRow.merchant_reference
      )
      const locations = new Map<string, MerchantLocationEntity>()
      for (const locationRow of locationRows) {
        const {
          merchant_reference: _merchantReference,
          location_reference: locationReference,
          rowNumber: _rowNumber,
          ...locationData
        } = locationRow
        const location = manager.create(MerchantLocationEntity, {
          ...locationData,
          merchant
        })
        await manager.save(MerchantLocationEntity, location)
        locations.set(locationReference, location)
      }

      const counterRows = data.checkoutCounters.filter(
        counter => counter.merchant_reference === merchantRow.merchant_reference
      )
      for (const [counterIndex, counterRow] of counterRows.entries()) {
        const location = locations.get(counterRow.location_reference)
        if (location === undefined) throw new Error('Validated checkout location is missing')
        const counter = manager.create(CheckoutCounterEntity, {
          counter_number: counterIndex + 1,
          description: counterRow.description,
          alias_value: effectiveCounterAlias(merchantRow, counterRow, counterIndex),
          merchant,
          checkout_location: location
        })
        await manager.save(CheckoutCounterEntity, counter)
      }
      merchant.next_checkout_counter_number = counterRows.length + 1

      const ownerRows = data.businessOwners.filter(
        owner => owner.merchant_reference === merchantRow.merchant_reference
      )
      const owners: BusinessOwnerEntity[] = []
      for (const ownerRow of ownerRows) {
        const ownerData = withoutSourceRow(ownerRow)
        const {
          merchant_reference: _merchantReference,
          identification_type: identificationType,
          name,
          identification_number: identificationNumber,
          phone_number: phoneNumber,
          email,
          ...ownerLocationData
        } = ownerData
        const ownerLocation = manager.create(BusinessPersonLocationEntity, ownerLocationData)
        await manager.save(BusinessPersonLocationEntity, ownerLocation)
        const owner = manager.create(BusinessOwnerEntity, {
          name,
          identificaton_type: identificationType,
          identification_number: identificationNumber,
          phone_number: phoneNumber,
          email: email === '' ? undefined : email,
          businessPersonLocation: ownerLocation
        })
        owners.push(await manager.save(BusinessOwnerEntity, owner))
      }
      merchant.business_owners = owners
      await manager.save(MerchantEntity, merchant)

      const contactRows = data.contactPersons.filter(
        contact => contact.merchant_reference === merchantRow.merchant_reference
      )
      for (const contactRow of contactRows) {
        const contact = manager.create(ContactPersonEntity, {
          name: contactRow.name,
          phone_number: contactRow.phone_number,
          email: contactRow.email === '' ? undefined : contactRow.email,
          merchant
        })
        await manager.save(ContactPersonEntity, contact)
      }

      merchantIds.push({
        merchant_reference: merchantRow.merchant_reference,
        merchant_id: merchant.id
      })
    }

    const result: BulkMerchantImportResult = {
      import_id: importRecord.id,
      merchants_created: data.merchants.length,
      locations_created: data.locations.length,
      checkout_counters_created: data.checkoutCounters.length,
      business_owners_created: data.businessOwners.length,
      contact_persons_created: data.contactPersons.length,
      merchant_ids: merchantIds
    }
    importRecord.result = result as unknown as Record<string, unknown>
    await manager.save(MerchantBulkImportEntity, importRecord)

    const auditSummary = {
      import_id: result.import_id,
      merchants_created: result.merchants_created,
      locations_created: result.locations_created,
      checkout_counters_created: result.checkout_counters_created,
      business_owners_created: result.business_owners_created,
      contact_persons_created: result.contact_persons_created
    }
    const auditRecord = manager.create(AuditEntity, {
      action_type: AuditActionType.ADD,
      transaction_status: AuditTrasactionStatus.SUCCESS,
      application_module: 'importBulkMerchants',
      event_description: `Bulk merchant import ${result.import_id} created ${result.merchants_created} merchants`,
      entity_name: 'MerchantEntity',
      old_value: '{}',
      new_value: JSON.stringify(auditSummary),
      portal_user: portalUser,
      dfsp: portalUser.dfsp
    })
    await manager.save(AuditEntity, auditRecord)
    return result
  })
}

function isUniqueConstraintError (error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false
  const driverError = error.driverError as { code?: string } | undefined
  return driverError?.code === 'ER_DUP_ENTRY' || driverError?.code === 'SQLITE_CONSTRAINT'
}

export async function importBulkMerchants (
  data: BulkMerchantWorkbookData,
  portalUser: PortalUserEntity,
  idempotencyKey: string,
  workbookBuffer: Buffer
): Promise<BulkMerchantImportResult> {
  if (portalUser.dfsp == null) {
    throw new BulkMerchantValidationError([{
      sheet: '', row: 0, field: '', message: 'A DFSP user is required for merchant onboarding'
    }])
  }

  const keyHash = hash(`${portalUser.id}:${idempotencyKey}`)
  const requestHash = hash(workbookBuffer)
  const importRepository = AppDataSource.getRepository(MerchantBulkImportEntity)
  const existing = await importRepository.findOneBy({ key_hash: keyHash })
  if (existing !== null) {
    if (existing.request_hash !== requestHash) {
      throw new BulkMerchantIdempotencyConflictError(
        'Idempotency-Key was already used with a different workbook'
      )
    }
    return { ...(existing.result as unknown as BulkMerchantImportResult), idempotent_replay: true }
  }

  await validateExternalData(data)

  let result: BulkMerchantImportResult
  try {
    result = await createMerchants(data, portalUser, keyHash, requestHash)
  } catch (error) {
    if (isMerchantLeiUniqueConstraintError(error)) {
      const registrations = await findGlobalMerchantLeiRegistrations(
        data.merchants.map(merchant => merchant.lei)
      )
      throw new BulkMerchantValidationError(data.merchants.flatMap(merchant => {
        const registration = registrations.get(merchant.lei)
        return registration === undefined
          ? []
          : [{
              sheet: 'Merchants',
              row: merchant.rowNumber,
              field: 'lei',
              message: merchantLeiConflictMessage(registration)
            }]
      }))
    }
    if (!isUniqueConstraintError(error)) throw error
    const concurrent = await importRepository.findOneBy({ key_hash: keyHash })
    if (concurrent === null) throw error
    if (concurrent.request_hash !== requestHash) {
      throw new BulkMerchantIdempotencyConflictError(
        'Idempotency-Key was already used with a different workbook'
      )
    }
    return { ...(concurrent.result as unknown as BulkMerchantImportResult), idempotent_replay: true }
  }

  return result
}
