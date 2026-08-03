# Merchant Registry Helm chart

This chart deploys the stateless merchant components:

- Acquirer backend
- Acquirer frontend
- Registry Oracle

MySQL, object storage, and Kubernetes Secrets are intentionally external. This
keeps production state lifecycle and credentials outside the application
release. Local development can continue to use the repository's Docker Compose
stack.

## Install

```bash
helm repo add thitsax https://thitsax.github.io/merchant-registry-svc
helm repo update
helm upgrade --install merchant-registry thitsax/merchant-registry \
  --version 1.1.1 \
  --namespace mojaloop \
  --values values.yaml
```

At minimum, override:

- `database.host`, database names, username, and `database.passwordSecret`
- `auth.jwtSecret`
- `registry.internalApiKeySecret`
- `objectStorage` endpoints and `credentialsSecret`
- the three public URLs under `app`

Email and reCAPTCHA remain optional. `email.provider: none` and
`recaptcha.enabled: false` are safe defaults. Enabling SendGrid requires an
existing Secret reference in `email.sendgridApiKeySecret`; enabling reCAPTCHA
requires `recaptcha.backendSecret` and a frontend site key.

## Publish

Publishing is handled by `.github/workflows/publish-helm.yml`. A GitHub release
publishes a matching chart and application version. The manual workflow is used
when the chart and application versions intentionally differ, such as chart
`1.1.1` deploying application images `1.1.6`.

For the first publication only, configure GitHub Pages to deploy from the
`gh-pages` branch at `/ (root)`. Subsequent workflow runs update the packaged
charts and repository index on that branch.
