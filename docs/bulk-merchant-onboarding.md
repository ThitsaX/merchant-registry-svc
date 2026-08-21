# Bulk merchant onboarding

DFSP users with the **Create Merchants** permission can onboard multiple
merchants from the Registry page.

## Workflow

1. Select **Download Excel template** on the Registry page.
2. Read the `Instructions` sheet and use `Reference Data` for supported
   currency, business activity, and MCC values.
3. Complete the five data sheets:
   - `Merchants`
   - `Locations`
   - `Checkout Counters`
   - `Business Owners`
   - `Contact Persons`
4. Select **Choose XLSX file**, then **Upload merchants**.
5. Correct every reported sheet/row error and upload again if validation fails.

Blue column headings are required and grey headings are optional. Hover over a
heading for field-specific help. The workbook provides dropdowns for currencies,
business activity codes, MCCs, merchant and location types, owner ID types,
countries, and references entered on the parent sheets. Complete `Merchants`
and `Locations` first so those references are available when filling the child
sheets. Automatic description columns beside the merchant data confirm the
selected business activity and MCC. Dropdowns are backed by workbook ranges, so
the complete reference lists work in Excel and LibreOffice without the
inline-list length limit.

The upload is atomic: one invalid row prevents the entire workbook from being
written. Successful merchants enter **Review**, where a different authorized
user completes the normal approval workflow. The import never registers aliases
directly with Registry Oracle and never bypasses maker/checker controls.

## References and child records

`merchant_reference` is a file-local identifier such as `MERCHANT_001`. It must
be unique on the `Merchants` sheet and must be repeated on every child row.
`location_reference` identifies a location within one merchant and links
checkout counters to that location.

Every merchant requires at least one location, one business owner, and one
contact person. Every location requires between 1 and 50 checkout counters.
Rows appear in checkout-counter numbering order across a merchant.

## LEI rules

LEI is optional. When supplied, it must be a valid 20-character Legal Entity
Identifier. LEIs are normalized to uppercase and checked case-insensitively. A
LEI may be registered with only one DFSP, so duplicates within the workbook or
against any existing merchant are rejected. Existing-record errors identify
the DFSP name and FSP ID that already owns the LEI.

## Alias rules

Aliases are optional. If `payinto_alias` is supplied, it becomes checkout
counter 1's alias; the first `Checkout Counters.alias_value` must be blank or
match it. Additional counter aliases belong in the `Checkout Counters` sheet.
All supplied aliases are checked for duplicates within the workbook, the local
database, and Registry Oracle before anything is written. Blank aliases are
generated during approval.

## Limits and retry safety

- XLSX files only, up to 5 MB.
- Up to 250 merchants per workbook.
- Up to 5,000 rows on each child sheet.
- Up to 50 checkout counters per location.

The frontend sends an `Idempotency-Key` with each selected file. Repeating the
same request returns the original result without creating duplicate merchants;
reusing the key for different file contents returns HTTP 409.

License numbers can be imported. License PDF files are intentionally excluded
from Excel uploads and can be attached through the normal merchant form when
required.

The onboarding form does not collect an account number. Checkout-counter aliases
are routing identifiers, while a settlement account belongs to the DFSP's account
system. A future settlement-account workflow must validate and provision that
mapping at the selected DFSP rather than merely storing an unused number in the
merchant registry.

## API

- `GET /api/v1/merchants/bulk-upload/template` downloads the current template.
- `POST /api/v1/merchants/bulk-upload` accepts multipart field `file` and a
  required `Idempotency-Key` header.

Validation failures return HTTP 422 with `errors[]`, containing `sheet`, `row`,
`field`, and `message`. No merchant records are created in that case.
