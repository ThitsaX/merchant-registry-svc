## Prerequisites

- MySQL/MariaDB
  - Database name should exists/create as defined inside `.env` file.
  - Database username/password should exists/create as defined inside `.env` file.
- [MinIO (S3 Compatible Object Storage Server)](https://min.io/) (For Local Development and Testing PDF uploads)
  - Default values are already configured inside `.env`.
    - Should use AWS S3 configration when in Production.
  - Running Local S3 Object Storage Server with `minio server s3-storage`
    - `s3-storage` is the name of the directory.

## Run with

1. `npm install`
2. `cp .env.example .env` and replace the placeholder secrets.
3. `npm run start` when you are inside `<rootProject>/packages/acquirer-backed`
   or
   <br />
   `npm run acquirer-backend:start` when you are at `rootProject` directory.

## Integration Testings

- Make sure MySQL/MaridaDB database name, username, password are configured
  according to the `.env.test` file.
- Make sure S3 Minio Server is running... either

- `npm run test` when you are inside `<rootProject>/packages/acquirer-backed`
- `npm run test -w acquirer-backend` when you are at `rootProject` directory.

## Configuration

| Environment Variables                    | Default Values                       | Description                                                                            |
| ---------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                               | `development`                        | Sets the environment for Node.js. Common values: `development`, `production`, `test`.  |
| `APP_URL`                                | `http://localhost:5555`              | URL of the app, used for features like email verification.                             |
| `HOST`                                   | `0.0.0.0`                            | Host IP address for the server.                                                        |
| `PORT`                                   | `5555`                               | Port number for the server.                                                            |
| `FRONTEND_SET_PASSWORD_URL`              | `http://localhost:5173/set-password` | URL for redirecting to set password in frontend, typically used in email verification. |
| `JWT_SECRET`                             | `merchant-acquirer-jwt_secret`       | Secret key for JWT. _(Change in production)_                                           |
| `JWT_EXPIRES_IN`                         | `1d`                                 | Expiration time for JWT. Common formats: `1d` for 1 day, `2h` for 2 hours, etc.        |
| `RECAPTCHA_SECRET_KEY`                   | `recaptcha-secret-key`               | Backend Secret key for Google reCAPTCHA. (Change in production)                        |
| `RECAPTCHA_ENABLED`                      | `false`                              | Enable or disable Google reCAPTCHA.                                                    |
| **API Key Generation Configuration**     |                                      |                                                                                        |
| `API_KEY_LENGTH`                         | `64`                                 | Length of the generated API key.                                                       |
| `API_KEY_PREFIX`                         | `MR`                                 | Prefix for the API key.                                                                |
| **MySQL Database Configuration**         |                                      |                                                                                        |
| `DB_HOST`                                | `localhost`                          | MySQL database server host.                                                            |
| `DB_PORT`                                | `3306`                               | Port for the MySQL database.                                                           |
| `DB_USERNAME`                            | `merchant_acquirer_user`             | Username for MySQL database.                                                           |
| `DB_PASSWORD`                            | `password`                           | Password for MySQL database.                                                           |
| `DB_DATABASE`                            | `merchant_acquirer_db`               | Name of the MySQL database.                                                            |
| **Registry Oracle HTTP Configuration**   |                                      |                                                                                        |
| `REGISTRY_ORACLE_URL`                    | `http://127.0.0.1:8888`              | Internal URL of the Registry Oracle.                                                   |
| `REGISTRY_INTERNAL_API_KEY`              | _(required)_                         | Shared internal API secret. Use a strong secret in production.                         |
| `REGISTRY_HTTP_TIMEOUT_MS`               | `5000`                               | Timeout for Registry Oracle calls, in milliseconds.                                    |
| `REGISTRY_HTTP_RETRIES`                  | `2`                                  | Number of retries for network, throttling, and server failures.                        |
| **EMVCo QR Configuration**               |                                      |                                                                                        |
| `EMVCO_MERCHANT_ACCOUNT_GUI`             | `org.mojaloop`                       | Reverse-domain identifier that defines Mojaloop merchant account fields. Maximum 32 characters. |
| `EMVCO_DEFAULT_MCC`                      | `0000`                               | Four-digit fallback MCC for legacy merchants. A merchant-level MCC takes precedence.   |
| **S3/Minio Configuration**               |                                      |                                                                                        |
| `S3_ENDPOINT`                            | `localhost`                          | S3 or Minio server endpoint.                                                           |
| `S3_PORT`                                | `9000`                               | Port for S3 or Minio server. `443` for AWS S3 with HTTPS.                              |
| `S3_ACCESS_KEY`                          | `minioadmin`                         | Access key for S3 or Minio.                                                            |
| `S3_SECRET_KEY`                          | `minioadmin`                         | Secret key for S3 or Minio.                                                            |
| `S3_REGION`                              | `us-east-1`                          | Region for S3. Ignored by Minio.                                                       |
| `S3_USE_SSL`                             | `false`                              | Set to `true` for HTTPS with AWS S3.                                                   |
| `S3_MERCHANT_BUCKET_NAME`                | `merchant-documents`                 | Name of the S3 bucket for merchant documents.                                          |
| `S3_DFSP_LOGO_BUCKET_NAME`               | `dfsp-logos`                         | Name of the S3 bucket for DFSP logos.                                                  |
| **Optional Email Configuration**         |                                      |                                                                                        |
| `EMAIL_PROVIDER`                         | `none`                               | Email adapter: `none` or `sendgrid`. Core user creation and admin reset work without email. |
| `EMAIL_FROM`                             |                                      | Sender address required when `EMAIL_PROVIDER=sendgrid`.                                |
| `SENDGRID_API_KEY`                       |                                      | API key required only when `EMAIL_PROVIDER=sendgrid`.                                  |
| **Log Configuration**                    |                                      |                                                                                        |
| `LOG_PATH`                               | `./logs`                             | Path for storing logs.                                                                 |
| `LOG_LEVEL`                              | `debug`                              | Logging level. Values: `trace`, `debug`, `info`, `warn`, `error`, etc.                 |
| `LOG_DISABLED`                           | `false`                              | Enable or disable logging.                                                             |
| **General API Rate Limit Configuration** |                                      |                                                                                        |
| `GENERAL_RATE_LIMIT_WINDOW`              | `15m`                                | The time window for general API rate limiting, in minutes.                             |
| `GENERAL_RATE_LIMIT_MAX`                 | `100`                                | The maximum number of requests allowed in the time window.                             |
| **Login API Rate Limit Configuration**   |                                      |                                                                                        |
| `AUTH_RATE_LIMIT_WINDOW`                 | `1h`                                 | The time window for login API rate limiting, in minutes.                               |
| `AUTH_RATE_LIMIT_MAX`                    | `10`                                 | The maximum number of requests allowed in the time window.                             |

### User credentials and email adapters

Administrators create users and receive a generated temporary password once in
the API response. The user must replace that password at first login. An
administrator can generate another temporary password later; doing so revokes
the user's existing sessions. Password values and hashes are not included in
email or audit records.

With `EMAIL_PROVIDER=none`, account notifications are skipped and the
forgot-password email endpoint returns `503 EMAIL_DISABLED`; an administrator
can still issue a new temporary password. SendGrid is implemented behind
`src/services/email/EmailProvider.ts`. Additional providers can implement that
interface and be selected in the provider factory.
