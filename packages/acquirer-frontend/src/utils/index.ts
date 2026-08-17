import { jwtDecode } from 'jwt-decode'

import type { Decoded } from '@/types/auth'

export function scrollToTop() {
  document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })
}

export function formatLatitudeLongitude(latitude?: string, longitude?: string) {
  if (!latitude && !longitude) return 'N/A'

  if (!latitude || !longitude) return latitude || longitude

  return `${latitude}, ${longitude}`
}

export function downloadBlob(blobData: Blob, filename: string) {
  const url = URL.createObjectURL(blobData)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoke the Object URL when it's no longer needed
  URL.revokeObjectURL(url)
}

export function downloadMerchantsBlobAsXlsx(blobData: Blob) {
  downloadBlob(blobData, 'merchants.xlsx')
}

export function isTokenExpired(token: string) {
  const decoded: Decoded = jwtDecode(token)
  const expirationTimestamp = decoded.exp * 1000
  return expirationTimestamp <= Date.now()
}
