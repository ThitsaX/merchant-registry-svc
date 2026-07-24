const runtimeConfig = window.__RUNTIME_CONFIG__ ?? {}

export const API_URL =
  runtimeConfig.VITE_API_URL || import.meta.env.VITE_API_URL

export const RECAPTCHA_SITE_KEY =
  runtimeConfig.VITE_RECAPTCHA_SITE_KEY ||
  import.meta.env.VITE_RECAPTCHA_SITE_KEY
