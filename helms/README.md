## Helm Charts Deployment

### Default Ingress DNS (add following records to the `/etc/hosts` file)
   - www.acquirer-merchant.local

### Prerequisites

- Kubernetes cluster
- Helm 3
- Email is optional and defaults to `emailProvider: "none"`.
  - To enable SendGrid, set `emailProvider: "sendgrid"`, `emailFrom`, and
    `sendgridApiKey` in `./chart-acquirer-backend/values.yaml`.

- reCAPTCHA is disabled by default. To enable it, register for Google reCAPTCHA
  v2 and add the ingress domain:
  - https://www.google.com/recaptcha/admin/create
  - Update the `./chart-acquirer-backend/values.yaml` file with the following values:
    - `recaptchaEnabled: "true"`
    - `recaptchaBackendSiteKey`
  - Update the `./chart-acquirer-frontend/values.yaml` file with the following values:
    - `recaptchaEnabled: "true"`
    - `recaptchaFrontendSiteKey`

### Deploying the Helm Charts

1. Build Dependency Chart

```bash
helm dependency build <rootProject>/helms
```

2. Install the Helm chart:

```bash
helm install my-release <rootProject>/helms
```


### IMPORTANT NOTES:

When updating ingress's host make sure to update the `apiUrl` of `./chart-acquirer-frontend/values.yaml` file too.
Otherwise frontend will not be able to communicate with backend.
