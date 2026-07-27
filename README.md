## Merchant Registry System

This repository is dedicated to the development of a merchant payment system
using Mojaloop for seamless merchant transactions. The system allows consumers
to pay merchants using mobile wallets with interoperability.

In this current phase, we are focused on implementing the acquiring system and
merchant registry, which will serve as an oracle in the payment process.

The Mojaloop's Account Lookup Service will interact with the merchant registry
and proceed with the necessary steps in the payment transaction.

![Draw.io Diagram](./docs/Services.jpg)

##### For more information on Requirements, Diagrams, and User Stories

[Merchant Payment Documentation Repository](https://github.com/mojaloop/merchant-payment-docs/)

## Workspaces

* [Shared Library](./packages/shared-lib)
  * Usable Types, Enums, Methods etc..
* [Merchant Acquirer Backend Service](./packages/acquirer-backend)
  * Backend Service for handling Merchants Informations.
* [Merchant Acquirer Frontend](./packages/acquirer-frontend)
  * Portal for Hub Users, Makers, Checkers to manage and onboarding Merchants.
* [Merchant Registry Oracle](./packages/registry-oracle)
  * Will Serve as Oracle for Mojaloop ALS.

See the README.md file on each services for more Environment Variable Configuration options.

## Kubernetes Deployment with Helm Charts
* [Instruction README](./helms/README.md)

## Deploying on Docker
* Requirements
    - `docker` and `docker-compose`
    - Copy each service's safe template before local development:
      `cp packages/acquirer-backend/.env.example packages/acquirer-backend/.env`,
      `cp packages/acquirer-frontend/.env.example packages/acquirer-frontend/.env`, and
      `cp packages/registry-oracle/.env.example packages/registry-oracle/.env`.
    - Email is optional. The default `EMAIL_PROVIDER=none` requires no third-party
      account. To enable SendGrid notifications and emailed forgot-password links,
      set `EMAIL_PROVIDER=sendgrid`, `EMAIL_FROM`, and `SENDGRID_API_KEY`.
    - reCAPTCHA is disabled by default. To enable reCAPTCHA verification:
        - Register at [Google reCAPTCHA](https://www.google.com/recaptcha/admin/create) and create a reCAPTCHA v2 Checkbox.
        - Set `VITE_RECAPTCHA_ENABLED=true` and update `VITE_RECAPTCHA_SITE_KEY` in `./packages/acquirer-frontend/.env`.
        - Set `RECAPTCHA_ENABLED=true` and update `RECAPTCHA_SECRET_KEY` in `./packages/acquirer-backend/.env`.
    - Make sure to update IP/Domain name in `FRONTEND_SET_PASSWORD_URL`, `APP_URL` and `VITE_API_URL` if deploying other than `localhost` (`127.0.0.1`)

* Run 
    ```bash 
    docker-compose up --build
    ```
    The API images run compiled JavaScript with production-only dependencies. The
    frontend is served by Nginx and reads `VITE_API_URL`,
    `VITE_RECAPTCHA_ENABLED`, and `VITE_RECAPTCHA_SITE_KEY` when its container
    starts.
    * Acquirer Frontend should be running at: http://localhost:5173
    * Acquirer Backend should be running at: http://localhost:5555/api/v1/health-check
        * Swagger API Doc should be at: http://localhost:5555/docs
    * Merchant Registry Backend should be running at: http://localhost:8888/health-check
        * Swagger API Doc should be at: http://localhost:8888/docs
    * MinIO S3 Compatible Storage Server is running at http://minio:9000 (Service).
        * To be able to access merchant license document file or QRCode Image, 
            * For Linux/Mac, open `/etc/hosts` with root permission and add this line `127.0.0.1 minio`, otherwise `minio:9000` link will be unreachable.

## For Deploying manual without Docker
* Check [Manual Deployment Guide](./docs/manual-deployment-guide.md)

## Container releases

Publishing a GitHub Release with a semantic tag such as `v1.1.0` builds
multi-platform (`linux/amd64` and `linux/arm64`) images and publishes them to:

* `ghcr.io/thitsax/merchant-acquirer-backend`
* `ghcr.io/thitsax/merchant-acquirer-frontend`
* `ghcr.io/thitsax/merchant-registry-oracle`

The workflow creates `v1.1.0`, `1.1.0`, and `1.1` tags. A non-prerelease also
updates `latest`.

## Running Testing
Require `docker-compose up minio` (MinIO) to be running.
* Run at the root of the project
    ```bash
    npm install
    npm run acquirer-backend:test:coverage
    ```

## ERD Design
![ERD Design](./images/Entity-Relations-Diagram.png)

## Note
The Acquirer Backend uses an authenticated, idempotent internal HTTP API to
register merchants and DFSP credentials with the Registry Oracle. Both services
must use the same `REGISTRY_INTERNAL_API_KEY`.

Portal users are created with a one-time temporary password. The administrator
must copy it from the creation dialog and share it through a secure channel.
The user can sign in with it, but the API restricts the session until the
password is replaced. Email notifications never contain the temporary password.
