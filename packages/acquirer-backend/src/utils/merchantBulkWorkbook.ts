import { Workbook, type Row, type Worksheet } from 'exceljs'
import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import {
  BusinessOwnerIDType,
  CurrencyCodes,
  MerchantCategoryCodes,
  MerchantClassificationCodes,
  MerchantLocationType,
  MerchantType,
  NumberOfEmployees,
  isMerchantCategoryCode,
  isMerchantClassificationCode,
  MERCHANT_ALIAS_MAX_LENGTH,
  MERCHANT_ALIAS_PATTERN
} from 'shared-lib'
import * as z from 'zod'

countries.registerLocale(enLocale)

export const BULK_MERCHANT_MAX_ROWS = 250
const BULK_CHILD_MAX_ROWS = 5000

export interface BulkWorkbookIssue {
  sheet: string
  row: number
  field: string
  message: string
}

interface SourceRow {
  rowNumber: number
}

const referenceSchema = z.string().trim().min(1).max(64).regex(
  /^[A-Za-z0-9_-]+$/,
  'Use only letters, numbers, underscores, and hyphens'
)

const optionalText = (max = 255): z.ZodOptional<z.ZodString> =>
  z.string().trim().max(max).optional()
const optionalEmail = z.string().trim().email().or(z.literal('')).optional()
const optionalAlias = z.string().trim().max(MERCHANT_ALIAS_MAX_LENGTH).regex(
  MERCHANT_ALIAS_PATTERN,
  'Use only letters, numbers, underscores, and hyphens'
).or(z.literal('')).optional()

const merchantSchema = z.object({
  merchant_reference: referenceSchema,
  dba_trading_name: z.string().trim().min(1).max(255),
  registered_name: optionalText(),
  lei: z
    .string()
    .trim()
    .length(20, 'LEI must be exactly 20 alphanumeric characters')
    .regex(/^[A-Za-z0-9]{20}$/, 'LEI must be exactly 20 alphanumeric characters')
    .or(z.literal(''))
    .optional()
    .transform(value => value?.toUpperCase() ?? ''),
  employees_num: z.nativeEnum(NumberOfEmployees),
  monthly_turnover: z.string().trim().regex(
    /^\d+(?:\.\d+)?$/,
    'Use a non-negative number'
  ).or(z.literal('')).optional(),
  currency_code: z.nativeEnum(CurrencyCodes),
  category_code: z.string().trim().refine(
    isMerchantCategoryCode,
    'Business activity is not supported'
  ),
  mcc: z.string().trim().regex(/^\d{4}$/, 'MCC must contain exactly 4 digits').refine(
    isMerchantClassificationCode,
    'MCC is not supported'
  ),
  merchant_type: z.nativeEnum(MerchantType),
  payinto_alias: optionalAlias,
  license_number: optionalText()
})

const locationFields = {
  address_type: optionalText(),
  department: optionalText(),
  sub_department: optionalText(),
  street_name: optionalText(),
  building_number: optionalText(),
  building_name: optionalText(),
  floor_number: optionalText(),
  room_number: optionalText(),
  post_box: optionalText(),
  postal_code: optionalText(),
  town_name: z.string().trim().min(1).max(255),
  district_name: optionalText(),
  country_subdivision: optionalText(),
  country: z.string().trim().min(1).max(1024),
  address_line: optionalText(1024),
  latitude: optionalText(),
  longitude: optionalText()
}

const personLocationFields = {
  ...locationFields,
  town_name: optionalText(),
  country: optionalText(1024)
}

const locationSchema = z.object({
  merchant_reference: referenceSchema,
  location_reference: referenceSchema,
  location_type: z.nativeEnum(MerchantLocationType),
  web_url: optionalText(),
  ...locationFields
})

const counterSchema = z.object({
  merchant_reference: referenceSchema,
  location_reference: referenceSchema,
  description: z.string().trim().min(1).max(255),
  alias_value: optionalAlias
})

const ownerSchema = z.object({
  merchant_reference: referenceSchema,
  name: z.string().trim().min(1).max(255),
  identification_type: z.nativeEnum(BusinessOwnerIDType),
  identification_number: z.string().trim().min(1).max(255),
  phone_number: z.string().trim().min(1).max(255),
  email: optionalEmail,
  ...personLocationFields
})

const contactSchema = z.object({
  merchant_reference: referenceSchema,
  name: z.string().trim().min(1).max(255),
  phone_number: z.string().trim().min(1).max(255),
  email: optionalEmail
})

export type BulkMerchantRow = z.infer<typeof merchantSchema> & SourceRow
export type BulkLocationRow = z.infer<typeof locationSchema> & SourceRow
export type BulkCounterRow = z.infer<typeof counterSchema> & SourceRow
export type BulkOwnerRow = z.infer<typeof ownerSchema> & SourceRow
export type BulkContactRow = z.infer<typeof contactSchema> & SourceRow

export interface BulkMerchantWorkbookData {
  merchants: BulkMerchantRow[]
  locations: BulkLocationRow[]
  checkoutCounters: BulkCounterRow[]
  businessOwners: BulkOwnerRow[]
  contactPersons: BulkContactRow[]
}

export interface BulkMerchantWorkbookParseResult {
  data?: BulkMerchantWorkbookData
  issues: BulkWorkbookIssue[]
}

const SHEETS = {
  merchants: {
    name: 'Merchants',
    headers: [
      'merchant_reference', 'dba_trading_name', 'registered_name', 'lei',
      'employees_num', 'monthly_turnover', 'currency_code', 'category_code',
      'mcc', 'merchant_type', 'payinto_alias', 'license_number'
    ]
  },
  locations: {
    name: 'Locations',
    headers: [
      'merchant_reference', 'location_reference', 'location_type', 'web_url',
      'address_type', 'department', 'sub_department', 'street_name',
      'building_number', 'building_name', 'floor_number', 'room_number',
      'post_box', 'postal_code', 'town_name', 'district_name',
      'country_subdivision', 'country', 'address_line', 'latitude', 'longitude'
    ]
  },
  counters: {
    name: 'Checkout Counters',
    headers: ['merchant_reference', 'location_reference', 'description', 'alias_value']
  },
  owners: {
    name: 'Business Owners',
    headers: [
      'merchant_reference', 'name', 'identification_type',
      'identification_number', 'phone_number', 'email', 'address_type',
      'department', 'sub_department', 'street_name', 'building_number',
      'building_name', 'floor_number', 'room_number', 'post_box', 'postal_code',
      'town_name', 'district_name', 'country_subdivision', 'country',
      'address_line', 'latitude', 'longitude'
    ]
  },
  contacts: {
    name: 'Contact Persons',
    headers: ['merchant_reference', 'name', 'phone_number', 'email']
  }
} as const

const REQUIRED_HEADERS: Record<string, readonly string[]> = {
  [SHEETS.merchants.name]: [
    'merchant_reference', 'dba_trading_name', 'employees_num', 'currency_code',
    'category_code', 'mcc', 'merchant_type'
  ],
  [SHEETS.locations.name]: [
    'merchant_reference', 'location_reference', 'location_type', 'town_name', 'country'
  ],
  [SHEETS.counters.name]: [
    'merchant_reference', 'location_reference', 'description'
  ],
  [SHEETS.owners.name]: [
    'merchant_reference', 'name', 'identification_type',
    'identification_number', 'phone_number'
  ],
  [SHEETS.contacts.name]: ['merchant_reference', 'name', 'phone_number']
}

const HEADER_HELP: Record<string, string> = {
  merchant_reference: 'Your file-local merchant ID, for example MERCHANT_001. Reuse it on every related sheet.',
  location_reference: 'Your file-local location ID, for example MAIN. It must be unique within the merchant.',
  dba_trading_name: 'The public or trading name used by the merchant.',
  registered_name: 'The merchant legal name, when different from the trading name.',
  lei: 'Optional 20-character Legal Entity Identifier. Leave blank when the merchant has no LEI.',
  employees_num: 'Select the employee range from the dropdown.',
  monthly_turnover: 'Enter a non-negative number without a currency symbol.',
  currency_code: 'Select the three-letter settlement currency from the dropdown.',
  category_code: 'Select the business activity code. Descriptions are on Reference Data.',
  mcc: 'Select the four-digit ISO 18245 merchant category code. Descriptions are on Reference Data.',
  merchant_type: 'Select the merchant type from the dropdown.',
  payinto_alias: 'Optional alias for checkout counter 1. Leave blank to generate it during approval.',
  license_number: 'Optional license number. Attach license evidence later through the merchant form.',
  location_type: 'Select Physical or Virtual.',
  country: 'Select a country from the dropdown.',
  description: 'A short checkout-counter description, for example Main till.',
  alias_value: 'Optional checkout-counter alias. Leave blank to generate it during approval.',
  identification_type: 'Select the business owner identification type.',
  identification_number: 'The business owner identification document number.',
  phone_number: 'Enter the full phone number, preferably in international format.',
  email: 'Optional email address.'
}

const NAMED_LISTS = {
  currencies: 'BulkCurrencies',
  categories: 'BulkCategoryCodes',
  classifications: 'BulkMccCodes',
  employeeCounts: 'BulkEmployeeCounts',
  merchantTypes: 'BulkMerchantTypes',
  locationTypes: 'BulkLocationTypes',
  identificationTypes: 'BulkIdentificationTypes',
  countries: 'BulkCountries',
  merchantReferences: 'BulkMerchantReferences',
  locationReferences: 'BulkLocationReferences'
} as const

function rowIsEmpty (row: Row, columnNumbers: number[]): boolean {
  return columnNumbers.every(columnNumber => row.getCell(columnNumber).text.trim() === '')
}

function parseSheet<TSchema extends z.ZodTypeAny> (
  worksheet: Worksheet | undefined,
  sheetName: string,
  headers: readonly string[],
  schema: TSchema,
  maximumRows: number,
  issues: BulkWorkbookIssue[]
): Array<z.output<TSchema> & SourceRow> {
  if (worksheet === undefined) {
    issues.push({ sheet: sheetName, row: 1, field: '', message: 'Worksheet is required' })
    return []
  }

  const headerPositions = new Map<string, number>()
  worksheet.getRow(1).eachCell((cell, columnNumber) => {
    headerPositions.set(cell.text.trim().toLowerCase(), columnNumber)
  })

  for (const header of headers) {
    if (!headerPositions.has(header)) {
      issues.push({
        sheet: sheetName,
        row: 1,
        field: header,
        message: `Missing required column "${header}"`
      })
    }
  }
  if (headers.some(header => !headerPositions.has(header))) return []

  const columnNumbers = headers.map(header => headerPositions.get(header) as number)
  const parsedRows: Array<z.output<TSchema> & SourceRow> = []
  let populatedRows = 0
  let firstOverflowRow: number | undefined
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rowIsEmpty(row, columnNumbers)) return
    populatedRows++
    if (populatedRows > maximumRows) {
      firstOverflowRow ??= rowNumber
      return
    }

    const raw = Object.fromEntries(headers.map(header => [
      header,
      row.getCell(headerPositions.get(header) as number).text.trim()
    ]))
    const result = schema.safeParse(raw)
    if (!result.success) {
      for (const validationIssue of result.error.issues) {
        issues.push({
          sheet: sheetName,
          row: rowNumber,
          field: validationIssue.path.join('.'),
          message: validationIssue.message
        })
      }
      return
    }
    parsedRows.push({ ...result.data, rowNumber })
  })

  if (populatedRows > maximumRows) {
    issues.push({
      sheet: sheetName,
      row: firstOverflowRow as number,
      field: '',
      message: `Worksheet cannot contain more than ${maximumRows} data rows`
    })
  }
  return parsedRows
}

function addIssue (
  issues: BulkWorkbookIssue[],
  sheet: string,
  row: SourceRow,
  field: string,
  message: string
): void {
  issues.push({ sheet, row: row.rowNumber, field, message })
}

function validateRelationships (data: BulkMerchantWorkbookData, issues: BulkWorkbookIssue[]): void {
  const merchants = new Map<string, BulkMerchantRow>()
  const merchantLeis = new Map<string, BulkMerchantRow>()
  for (const merchant of data.merchants) {
    const existing = merchants.get(merchant.merchant_reference)
    if (existing !== undefined) {
      addIssue(
        issues,
        SHEETS.merchants.name,
        merchant,
        'merchant_reference',
        `Duplicate reference; first used on row ${existing.rowNumber}`
      )
    } else {
      merchants.set(merchant.merchant_reference, merchant)
    }

    if (merchant.lei.length > 0) {
      const existingLei = merchantLeis.get(merchant.lei)
      if (existingLei !== undefined) {
        addIssue(
          issues,
          SHEETS.merchants.name,
          merchant,
          'lei',
          `LEI is duplicated; first used on row ${existingLei.rowNumber}`
        )
      } else {
        merchantLeis.set(merchant.lei, merchant)
      }
    }
  }

  const locations = new Map<string, BulkLocationRow>()
  for (const location of data.locations) {
    if (!merchants.has(location.merchant_reference)) {
      addIssue(issues, SHEETS.locations.name, location, 'merchant_reference', 'Unknown merchant')
    }
    const key = `${location.merchant_reference}\u0000${location.location_reference}`
    const existing = locations.get(key)
    if (existing !== undefined) {
      addIssue(
        issues,
        SHEETS.locations.name,
        location,
        'location_reference',
        `Duplicate reference for this merchant; first used on row ${existing.rowNumber}`
      )
    } else {
      locations.set(key, location)
    }
  }

  const counterCounts = new Map<string, number>()
  for (const counter of data.checkoutCounters) {
    const locationKey = `${counter.merchant_reference}\u0000${counter.location_reference}`
    if (!locations.has(locationKey)) {
      addIssue(
        issues,
        SHEETS.counters.name,
        counter,
        'location_reference',
        'Unknown location for this merchant'
      )
    }
    counterCounts.set(locationKey, (counterCounts.get(locationKey) ?? 0) + 1)
  }

  for (const location of data.locations) {
    const key = `${location.merchant_reference}\u0000${location.location_reference}`
    const count = counterCounts.get(key) ?? 0
    if (count === 0) {
      addIssue(
        issues,
        SHEETS.locations.name,
        location,
        'location_reference',
        'At least one checkout counter is required'
      )
    } else if (count > 50) {
      addIssue(
        issues,
        SHEETS.locations.name,
        location,
        'location_reference',
        'A location cannot have more than 50 checkout counters'
      )
    }
  }

  const ownerCounts = new Map<string, number>()
  for (const owner of data.businessOwners) {
    if (!merchants.has(owner.merchant_reference)) {
      addIssue(issues, SHEETS.owners.name, owner, 'merchant_reference', 'Unknown merchant')
    }
    ownerCounts.set(owner.merchant_reference, (ownerCounts.get(owner.merchant_reference) ?? 0) + 1)
  }

  const contactCounts = new Map<string, number>()
  for (const contact of data.contactPersons) {
    if (!merchants.has(contact.merchant_reference)) {
      addIssue(issues, SHEETS.contacts.name, contact, 'merchant_reference', 'Unknown merchant')
    }
    contactCounts.set(
      contact.merchant_reference,
      (contactCounts.get(contact.merchant_reference) ?? 0) + 1
    )
  }

  for (const merchant of data.merchants) {
    if (![...locations.values()].some(
      location => location.merchant_reference === merchant.merchant_reference
    )) {
      addIssue(
        issues,
        SHEETS.merchants.name,
        merchant,
        'merchant_reference',
        'At least one location is required'
      )
    }
    if ((ownerCounts.get(merchant.merchant_reference) ?? 0) === 0) {
      addIssue(
        issues,
        SHEETS.merchants.name,
        merchant,
        'merchant_reference',
        'At least one business owner is required'
      )
    }
    if ((contactCounts.get(merchant.merchant_reference) ?? 0) === 0) {
      addIssue(
        issues,
        SHEETS.merchants.name,
        merchant,
        'merchant_reference',
        'At least one contact person is required'
      )
    }
  }

  validateWorkbookAliases(data, issues)
}

function validateWorkbookAliases (
  data: BulkMerchantWorkbookData,
  issues: BulkWorkbookIssue[]
): void {
  const aliases = new Map<string, { sheet: string, row: number }>()

  for (const merchant of data.merchants) {
    const merchantCounters = data.checkoutCounters.filter(
      counter => counter.merchant_reference === merchant.merchant_reference
    )
    const primaryAlias = merchant.payinto_alias ?? ''
    const firstCounter = merchantCounters[0]
    if (
      primaryAlias !== '' &&
      firstCounter?.alias_value !== undefined &&
      firstCounter.alias_value !== '' &&
      firstCounter.alias_value !== primaryAlias
    ) {
      addIssue(
        issues,
        SHEETS.counters.name,
        firstCounter,
        'alias_value',
        'The first counter alias must match payinto_alias or be blank'
      )
    }

    merchantCounters.forEach((counter, index) => {
      const alias = index === 0 && primaryAlias !== ''
        ? primaryAlias
        : (counter.alias_value ?? '')
      if (alias === '') return

      const normalizedAlias = alias.toLowerCase()
      const existing = aliases.get(normalizedAlias)
      if (existing !== undefined) {
        addIssue(
          issues,
          SHEETS.counters.name,
          counter,
          'alias_value',
          `Alias is duplicated; first used on ${existing.sheet} row ${existing.row}`
        )
      } else {
        aliases.set(normalizedAlias, {
          sheet: index === 0 && primaryAlias !== ''
            ? SHEETS.merchants.name
            : SHEETS.counters.name,
          row: index === 0 && primaryAlias !== ''
            ? merchant.rowNumber
            : counter.rowNumber
        })
      }
    })
  }
}

export async function parseBulkMerchantWorkbook (
  buffer: Buffer
): Promise<BulkMerchantWorkbookParseResult> {
  const workbook = new Workbook()
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    )
  } catch {
    return {
      issues: [{ sheet: '', row: 0, field: '', message: 'File is not a valid XLSX workbook' }]
    }
  }

  const issues: BulkWorkbookIssue[] = []
  const data: BulkMerchantWorkbookData = {
    merchants: parseSheet(
      workbook.getWorksheet(SHEETS.merchants.name),
      SHEETS.merchants.name,
      SHEETS.merchants.headers,
      merchantSchema,
      BULK_MERCHANT_MAX_ROWS,
      issues
    ),
    locations: parseSheet(
      workbook.getWorksheet(SHEETS.locations.name),
      SHEETS.locations.name,
      SHEETS.locations.headers,
      locationSchema,
      BULK_CHILD_MAX_ROWS,
      issues
    ),
    checkoutCounters: parseSheet(
      workbook.getWorksheet(SHEETS.counters.name),
      SHEETS.counters.name,
      SHEETS.counters.headers,
      counterSchema,
      BULK_CHILD_MAX_ROWS,
      issues
    ),
    businessOwners: parseSheet(
      workbook.getWorksheet(SHEETS.owners.name),
      SHEETS.owners.name,
      SHEETS.owners.headers,
      ownerSchema,
      BULK_CHILD_MAX_ROWS,
      issues
    ),
    contactPersons: parseSheet(
      workbook.getWorksheet(SHEETS.contacts.name),
      SHEETS.contacts.name,
      SHEETS.contacts.headers,
      contactSchema,
      BULK_CHILD_MAX_ROWS,
      issues
    )
  }

  if (data.merchants.length === 0 && !issues.some(issue => issue.sheet === SHEETS.merchants.name)) {
    issues.push({
      sheet: SHEETS.merchants.name,
      row: 2,
      field: '',
      message: 'At least one merchant is required'
    })
  }

  if (issues.length === 0) validateRelationships(data, issues)
  return issues.length > 0 ? { issues } : { data, issues }
}

function setHeaders (worksheet: Worksheet, headers: readonly string[]): void {
  const requiredHeaders = new Set(REQUIRED_HEADERS[worksheet.name] ?? [])
  worksheet.columns = headers.map(header => ({
    header,
    key: header,
    width: 24,
    style: { numFmt: '@' }
  }))
  worksheet.views = [{ state: 'frozen', ySplit: 1 }]
  worksheet.autoFilter = { from: 'A1', to: `${worksheet.getColumn(headers.length).letter}1` }
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', wrapText: true }
  headerRow.height = 32
  headerRow.eachCell(cell => {
    const header = cell.text
    const required = requiredHeaders.has(header)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: required ? 'FF2B6CB0' : 'FF718096' }
    }
    cell.note = `${required ? 'Required' : 'Optional'}. ${HEADER_HELP[header] ?? 'Enter text.'}`
  })
  worksheet.properties.tabColor = { argb: 'FF2B6CB0' }
}

function addListValidation (
  worksheet: Worksheet,
  header: string,
  listName: string,
  maximumRows: number,
  options: {
    allowBlank?: boolean
    prompt?: string
  } = {}
): void {
  let columnNumber = -1
  worksheet.getRow(1).eachCell((cell, currentColumnNumber) => {
    if (cell.text === header) columnNumber = currentColumnNumber
  })
  if (columnNumber < 1) return
  for (let rowNumber = 2; rowNumber <= maximumRows + 1; rowNumber++) {
    worksheet.getCell(rowNumber, columnNumber).dataValidation = {
      type: 'list',
      allowBlank: options.allowBlank ?? false,
      formulae: [listName],
      showInputMessage: true,
      promptTitle: 'Select from the list',
      prompt: options.prompt ?? 'Choose a supported value from the dropdown.',
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Unsupported value',
      error: 'Choose a value from the dropdown list.'
    }
  }
}

function addNamedRange (
  workbook: Workbook,
  sheetName: string,
  columnLetter: string,
  firstRow: number,
  lastRow: number,
  name: string
): void {
  workbook.definedNames.add(
    `'${sheetName}'!$${columnLetter}$${firstRow}:$${columnLetter}$${lastRow}`,
    name
  )
}

function addMerchantLookupHelpers (worksheet: Worksheet): void {
  const categoryColumn = worksheet.getColumn('category_code')
  const mccColumn = worksheet.getColumn('mcc')
  const helperColumns = [
    {
      header: 'category_description (automatic)',
      width: 60,
      formula: (rowNumber: number) =>
        `IFERROR(VLOOKUP(${categoryColumn.letter}${rowNumber},'Reference Data'!$B:$C,2,FALSE),"")`
    },
    {
      header: 'mcc_description (automatic)',
      width: 70,
      formula: (rowNumber: number) =>
        `IFERROR(VLOOKUP(${mccColumn.letter}${rowNumber},'Reference Data'!$D:$E,2,FALSE),"")`
    }
  ]

  helperColumns.forEach((helper, index) => {
    const column = worksheet.getColumn(SHEETS.merchants.headers.length + index + 1)
    column.width = helper.width
    const headerCell = worksheet.getCell(1, column.number)
    headerCell.value = helper.header
    headerCell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF718096' }
    }
    headerCell.alignment = { vertical: 'middle', wrapText: true }
    headerCell.note = 'Automatic description. Do not edit this column.'
    for (let rowNumber = 2; rowNumber <= BULK_MERCHANT_MAX_ROWS + 1; rowNumber++) {
      const cell = worksheet.getCell(rowNumber, column.number)
      cell.value = { formula: helper.formula(rowNumber), result: '' }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF7FAFC' }
      }
      cell.font = { color: { argb: 'FF4A5568' } }
      cell.alignment = { wrapText: true }
    }
  })

  worksheet.autoFilter = {
    from: 'A1',
    to: `${worksheet.getColumn(SHEETS.merchants.headers.length + helperColumns.length).letter}1`
  }
}

function addInstructions (workbook: Workbook): void {
  const sheet = workbook.addWorksheet('Instructions')
  sheet.columns = [
    { header: 'Topic', key: 'topic', width: 28 },
    { header: 'Instructions', key: 'instructions', width: 110 }
  ]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B6CB0' } }
  const rows = [
    ['Import behavior', 'The whole workbook is validated and imported atomically. Any error prevents every merchant from being created. Successful merchants enter Review and still require normal approval.'],
    ['Getting started', 'Blue column headings are required; grey headings are optional. Hover over a heading for help. Use the dropdowns instead of typing codes wherever one is available. The two automatic description columns confirm the selected activity and MCC. Do not rename sheets or column headings.'],
    ['References', 'Choose a unique merchant_reference for each merchant. Use it on every related sheet. location_reference must be unique within its merchant.'],
    ['Reference dropdowns', 'Complete the Merchants and Locations sheets first. Their references then appear in dropdowns on the related child sheets.'],
    ['LEI', 'Optional. When supplied, use a valid 20-character Legal Entity Identifier. An LEI can be registered with only one DFSP and cannot appear more than once in a workbook.'],
    ['Checkout counters', 'Provide at least one counter per location, in the desired numbering order. The first counter uses payinto_alias when supplied. Its alias_value must then be blank or the same value.'],
    ['Aliases', `Aliases are optional and globally unique. Use at most ${MERCHANT_ALIAS_MAX_LENGTH} letters, numbers, underscores, or hyphens. Blank aliases are generated during approval.`],
    ['Required relationships', 'Every merchant requires at least one location, checkout counter, business owner, and contact person.'],
    ['License documents', 'This workbook accepts license_number only. Add PDF evidence manually to the saved merchant when a document is required.'],
    ['Limits', `One upload supports at most ${BULK_MERCHANT_MAX_ROWS} merchants and 50 checkout counters per location.`],
    ['Examples', 'merchant_reference: MERCHANT_001; location_reference: MAIN; currency_code: LRD; category_code: 10410; mcc: 5812. Keep aliases and references formatted as text.']
  ]
  rows.forEach(([topic, instructions]) => sheet.addRow({ topic, instructions }))
  sheet.eachRow(row => { row.alignment = { vertical: 'top', wrapText: true } })
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
}

function addReferenceData (workbook: Workbook): void {
  const sheet = workbook.addWorksheet('Reference Data')
  sheet.columns = [
    { header: 'currency_code', key: 'currency', width: 18 },
    { header: 'category_code', key: 'category', width: 22 },
    { header: 'category_description', key: 'categoryDescription', width: 60 },
    { header: 'mcc', key: 'mcc', width: 15 },
    { header: 'mcc_description', key: 'mccDescription', width: 70 },
    { header: 'employees_num', key: 'employeeCount', width: 20 },
    { header: 'merchant_type', key: 'merchantType', width: 20 },
    { header: 'location_type', key: 'locationType', width: 20 },
    { header: 'identification_type', key: 'identificationType', width: 24 },
    { header: 'country', key: 'country', width: 36 }
  ]
  const currencies = Object.values(CurrencyCodes)
  const categories = Object.entries(MerchantCategoryCodes)
  const classifications = Object.entries(MerchantClassificationCodes)
  const employeeCounts = Object.values(NumberOfEmployees)
  const merchantTypes = Object.values(MerchantType)
  const locationTypes = Object.values(MerchantLocationType)
  const identificationTypes = Object.values(BusinessOwnerIDType)
  const countryNames = [...new Set(Object.values(countries.getNames('en')))]
    .sort((left, right) => left.localeCompare(right))
  const rowCount = Math.max(
    currencies.length,
    categories.length,
    classifications.length,
    countryNames.length
  )
  for (let index = 0; index < rowCount; index++) {
    sheet.addRow({
      currency: currencies[index],
      category: categories[index]?.[0],
      categoryDescription: categories[index]?.[1],
      mcc: classifications[index]?.[0],
      mccDescription: classifications[index]?.[1],
      employeeCount: employeeCounts[index],
      merchantType: merchantTypes[index],
      locationType: locationTypes[index],
      identificationType: identificationTypes[index],
      country: countryNames[index]
    })
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.autoFilter = { from: 'A1', to: 'J1' }
  sheet.properties.tabColor = { argb: 'FF718096' }

  addNamedRange(workbook, sheet.name, 'A', 2, currencies.length + 1, NAMED_LISTS.currencies)
  addNamedRange(workbook, sheet.name, 'B', 2, categories.length + 1, NAMED_LISTS.categories)
  addNamedRange(
    workbook,
    sheet.name,
    'D',
    2,
    classifications.length + 1,
    NAMED_LISTS.classifications
  )
  addNamedRange(
    workbook,
    sheet.name,
    'F',
    2,
    employeeCounts.length + 1,
    NAMED_LISTS.employeeCounts
  )
  addNamedRange(
    workbook,
    sheet.name,
    'G',
    2,
    merchantTypes.length + 1,
    NAMED_LISTS.merchantTypes
  )
  addNamedRange(
    workbook,
    sheet.name,
    'H',
    2,
    locationTypes.length + 1,
    NAMED_LISTS.locationTypes
  )
  addNamedRange(
    workbook,
    sheet.name,
    'I',
    2,
    identificationTypes.length + 1,
    NAMED_LISTS.identificationTypes
  )
  addNamedRange(workbook, sheet.name, 'J', 2, countryNames.length + 1, NAMED_LISTS.countries)
}

export function createBulkMerchantTemplate (): Workbook {
  const workbook = new Workbook()
  workbook.creator = 'Mojaloop Merchant Registry'
  workbook.created = new Date()
  addInstructions(workbook)

  const merchants = workbook.addWorksheet(SHEETS.merchants.name)
  setHeaders(merchants, SHEETS.merchants.headers)
  addMerchantLookupHelpers(merchants)

  const locations = workbook.addWorksheet(SHEETS.locations.name)
  setHeaders(locations, SHEETS.locations.headers)

  const counters = workbook.addWorksheet(SHEETS.counters.name)
  setHeaders(counters, SHEETS.counters.headers)

  const owners = workbook.addWorksheet(SHEETS.owners.name)
  setHeaders(owners, SHEETS.owners.headers)

  const contacts = workbook.addWorksheet(SHEETS.contacts.name)
  setHeaders(contacts, SHEETS.contacts.headers)
  addReferenceData(workbook)

  addNamedRange(
    workbook,
    merchants.name,
    'A',
    2,
    BULK_MERCHANT_MAX_ROWS + 1,
    NAMED_LISTS.merchantReferences
  )
  addNamedRange(
    workbook,
    locations.name,
    'B',
    2,
    BULK_CHILD_MAX_ROWS + 1,
    NAMED_LISTS.locationReferences
  )

  addListValidation(merchants, 'employees_num', NAMED_LISTS.employeeCounts, BULK_MERCHANT_MAX_ROWS)
  addListValidation(merchants, 'currency_code', NAMED_LISTS.currencies, BULK_MERCHANT_MAX_ROWS)
  addListValidation(merchants, 'category_code', NAMED_LISTS.categories, BULK_MERCHANT_MAX_ROWS, {
    prompt: 'Select a business activity code. See Reference Data for descriptions.'
  })
  addListValidation(merchants, 'mcc', NAMED_LISTS.classifications, BULK_MERCHANT_MAX_ROWS, {
    prompt: 'Select an MCC. See Reference Data for descriptions.'
  })
  addListValidation(merchants, 'merchant_type', NAMED_LISTS.merchantTypes, BULK_MERCHANT_MAX_ROWS)

  addListValidation(locations, 'merchant_reference', NAMED_LISTS.merchantReferences, BULK_CHILD_MAX_ROWS)
  addListValidation(locations, 'location_type', NAMED_LISTS.locationTypes, BULK_CHILD_MAX_ROWS)
  addListValidation(locations, 'country', NAMED_LISTS.countries, BULK_CHILD_MAX_ROWS)

  addListValidation(counters, 'merchant_reference', NAMED_LISTS.merchantReferences, BULK_CHILD_MAX_ROWS)
  addListValidation(counters, 'location_reference', NAMED_LISTS.locationReferences, BULK_CHILD_MAX_ROWS)

  addListValidation(owners, 'merchant_reference', NAMED_LISTS.merchantReferences, BULK_CHILD_MAX_ROWS)
  addListValidation(owners, 'identification_type', NAMED_LISTS.identificationTypes, BULK_CHILD_MAX_ROWS)
  addListValidation(owners, 'country', NAMED_LISTS.countries, BULK_CHILD_MAX_ROWS, {
    allowBlank: true
  })

  addListValidation(contacts, 'merchant_reference', NAMED_LISTS.merchantReferences, BULK_CHILD_MAX_ROWS)
  return workbook
}
