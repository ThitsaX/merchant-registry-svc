# Local setup and onboarding guide

This guide takes a new local installation from startup through Hub and DFSP
user setup, DFSP onboarding, and the first approved merchant. It describes the
normal operator workflow rather than a presentation or demonstration script.

The supplied credentials and secrets are for local development only. Replace
them before exposing the system outside a developer workstation.

## 1. Start the local stack

### Prerequisites

- Docker Engine with Docker Compose v2 (`docker compose`)
- Git
- Host ports `5173`, `5555`, `8888`, `3306`, and `9000` available. The
  application ports can be changed in `.env`; keep MinIO on host port `9000`
  for locally generated document and QR links.

From the repository root, create the local environment file:

```bash
cp .env.example .env
```

The default configuration disables Google reCAPTCHA and third-party email:

```dotenv
RECAPTCHA_ENABLED=false
VITE_RECAPTCHA_ENABLED=false
EMAIL_PROVIDER=none
```

If the portal will be opened from another computer, or if host ports are
changed, update these values together:

```dotenv
BACKEND_HOST_PORT=5555
FRONTEND_HOST_PORT=5173
APP_URL=http://127.0.0.1:5555
VITE_API_URL=http://127.0.0.1:5555/api/v1
FRONTEND_SET_PASSWORD_URL=http://localhost:5173/set-password
```

Build and start all five services:

```bash
docker compose up --build --detach
docker compose ps
```

Wait for the frontend, acquirer backend, Registry Oracle, MySQL, and MinIO
containers to report `healthy`. On first boot, country and address data can
continue loading briefly after the HTTP health checks succeed.

Verify the main endpoints:

- Portal: <http://localhost:5173>
- Acquirer Backend health: <http://localhost:5555/api/v1/health-check>
- Acquirer Backend API documentation: <http://localhost:5555/docs>
- Registry Oracle health: <http://localhost:8888/health-check>
- Registry Oracle API documentation: <http://localhost:8888/docs>

The two health endpoints should return:

```json
{"message":"OK"}
```

## 2. Bootstrap the Hub administrators

A fresh local database creates one bootstrap account:

```text
Email: hubsuperadmin@email.com
Password: password
```

This account can create Hub Administrators only. It cannot onboard a DFSP or
create DFSP users directly.

1. Sign in to the portal with the bootstrap account.
2. Open **Portal User Management → User Management**.
3. Select **Add new user**.
4. Enter the administrator's name and email, then select **Hub Admin**.
5. Submit the form.
6. Copy the generated temporary password before closing the dialog. It is
   displayed only once and is never included in an email.
7. Give the password to the new administrator through a secure channel.
8. Repeat the process for a second Hub Admin so account recovery does not
   depend on one person.

The bootstrap account can create at most three users. After a working Hub Admin
has signed in successfully, use that Hub Admin account to disable the known
bootstrap account. Do not expect it to retire automatically.

### First sign-in for every newly created user

1. Open a private browser window and sign in with the user's email and
   temporary password.
2. The portal redirects to **Change Password** and blocks access to all other
   protected functions.
3. Enter the temporary password and choose a different permanent password.
4. Sign in again with the permanent password.

Changing a temporary password or issuing a new one revokes the user's existing
sessions.

## 3. Onboard a DFSP

Sign in as a **Hub Admin**, then:

1. Open **Onboarding DFSP**.
2. Enter the exact Mojaloop participant ID in **DFSP ID (Participant ID)**.
3. Enter the DFSP name, type, and business-license ID.
4. Upload a JPG or PNG logo.
5. Select whether the DFSP will use the Merchant Acquiring Portal.
6. Submit the form.
7. Confirm the new participant appears under **DFSP List**.

DFSP Admin creation is a separate step even when the portal option is set to
**Yes**.

The local database already contains `DFSP 1`, `DFSP 2`, `DFSP 3`, and
`Green Bank`. Reuse one of them for a local walkthrough, or verify that a new
participant ID and name do not duplicate an existing entry before submitting.

### Create the first DFSP Admin

1. While signed in as a Hub Admin, open
   **Portal User Management → User Management**.
2. Select **Add new user**.
3. Enter the user's name and email.
4. Select **DFSP Admin** and choose the correct DFSP.
5. Submit, copy the one-time temporary password, and transfer it securely.
6. Ask the DFSP Admin to complete the first-sign-in password flow.

## 4. Build the DFSP operating team

The DFSP Admin should create at least one **DFSP Operator** so merchant
submissions can follow maker/checker separation. The Admin can also create a
**DFSP Auditor** for read-only access. Users created by a DFSP Admin are always
assigned to that administrator's DFSP.

| Role | Main onboarding capabilities |
| --- | --- |
| Hub Super Admin | Create Hub Admins only |
| Hub Admin | Onboard and view DFSPs; create Hub Admins and DFSP Admins; manage user status |
| DFSP Admin | Create Operators and Auditors; create, edit, submit, approve, reject, and revert merchants |
| DFSP Operator | Create, edit, submit, approve, reject, and revert merchants |
| DFSP Auditor | View merchants, users, and audit logs |

The portal hides navigation items for which the current user lacks permission.
The current **Role Management** screen displays the role matrix but does not
edit it.

## 5. Onboard a merchant

Use two different active users from the same DFSP:

- **Maker:** a DFSP Admin or Operator who enters and submits the merchant.
- **Checker:** another DFSP Admin or Operator who reviews the submission.

Before starting, collect:

- Doing-business-as name, employee count, merchant category, merchant type,
  and settlement currency
- Registered name, turnover, MCC, LEI, and business-license information when
  applicable
- Physical or virtual location details
- Country and at least a town or district
- Checkout-counter description
- Business-owner identity and phone number
- Contact-person name and phone number

Country and town/district are operationally required for QR generation even if
the current form does not mark every address field as mandatory.

### Maker steps

1. Sign in as the maker and open **Registry**.
2. Select **Add new record**.
3. Complete the four form stages:
   1. **Business Information**
   2. **Location Information**
   3. **Owner Information**
   4. **Contact Person**
4. Use **Save and Proceed** after each stage. The first stage creates a
   `Draft`; unfinished records can be reopened with
   **Continue with saved draft**.
5. On the contact stage, select **Review Submission**.
6. Check the complete record in the review dialog and select **Submit**.

Only the user recorded as the maker can move that merchant from `Draft` to
`Review`.

### Checker steps

1. Sign out and sign in as the checker.
2. Open **Merchant Records → Pending Merchant Records**.
3. Open and inspect the submitted merchant.
4. Choose one action:
   - **Approve** to register the merchant alias and generate the static
     checkout QR.
   - **Revert** with a reason when the maker must correct and resubmit the
     record.
   - **Reject** with a reason when the application should not continue.

The checker must be a different user from the maker and must belong to the same
DFSP.

On successful approval, the status moves through:

```text
Review → Waiting For Alias Generation → Approved
```

The Acquirer Backend registers the merchant with the Registry Oracle, receives
the merchant alias, generates a static EMVCo QR for the checkout counter, and
stores the QR image in MinIO. Successful registration also marks the merchant
`Allowed`. If registry synchronization fails, the merchant returns to `Review`
so approval can be retried.

To verify completion:

1. Open **Merchant Records → Alias Generated Merchant Records**.
2. Open **View Details** for the merchant.
3. Select **View QR Code** for the checkout counter.

## 6. Password recovery and user status

With the default `EMAIL_PROVIDER=none`, **Forgot Password** is intentionally
unavailable.

An eligible administrator can instead:

1. Open **User Management**.
2. Select **Reset password** for the user.
3. Copy the new one-time temporary password.
4. Transfer it securely to the user.
5. Ask the user to repeat the first-sign-in password flow.

An administrator cannot reset their own password this way. Use the normal
change-password function while signed in.

If SendGrid is enabled, account notifications still do not contain passwords;
emailed forgot-password links are valid for one hour.

## 7. Routine operations

View container output:

```bash
docker compose logs --follow acquirer-frontend
```

The production-mode API containers write their application logs inside the
containers:

```bash
docker compose exec acquirer-backend tail -f /app/logs/all_combined.log
docker compose exec registry-oracle tail -f /app/logs/all_combined.log
```

Stop and restart the existing stack:

```bash
docker compose stop
docker compose start
```

Remove containers while retaining MySQL and MinIO data:

```bash
docker compose down
```

Permanently reset all local database and object-storage data:

```bash
docker compose down --volumes
```

The final command is destructive and cannot recover existing local merchant,
user, alias, document, or QR data.

## 8. Troubleshooting

- **Services are healthy but lists are empty:** first-boot seed work may still
  be running; inspect both API application logs.
- **A checker cannot approve a merchant:** confirm the checker is not the maker,
  belongs to the same DFSP, and has Admin or Operator permissions.
- **A merchant returns to Review after approval:** verify Registry Oracle
  health and confirm `REGISTRY_INTERNAL_API_KEY` is identical in both services.
- **A merchant remains in Waiting For Alias Generation or its QR is missing:**
  confirm the merchant location includes a recognized country and a town or
  district, then inspect the Acquirer Backend and MinIO logs.
- **A MinIO image URL does not open locally:** add `127.0.0.1 minio` to the
  workstation's hosts file. Presigned local URLs use `minio:9000`.
- **Forgot Password returns an email-disabled error:** this is expected with
  `EMAIL_PROVIDER=none`; use administrator password reset.
- **A host port is occupied:** change the corresponding application or MySQL
  `*_HOST_PORT` value in `.env`, and keep the public frontend/backend URLs
  aligned. Keep `MINIO_HOST_PORT=9000` for the current local presigned-URL
  configuration.

## 9. Before using a non-local environment

- Replace the bootstrap password, JWT secret, database password, MinIO
  credentials, and Registry internal API key.
- Disable the bootstrap account after permanent Hub Admins are working.
- Use HTTPS and externally reachable URLs for the portal and APIs.
- Configure durable database, object storage, and log retention.
- Configure SendGrid and reCAPTCHA if required by the deployment.
- Do not enable or distribute optional seeded test accounts.
