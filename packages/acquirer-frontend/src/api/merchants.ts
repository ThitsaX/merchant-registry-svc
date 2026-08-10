import type { MerchantDetails } from '@/types/merchantDetails'
import instance from '@/lib/axiosInstance'
import type { AllMerchantsFilterForm } from '@/lib/validations/allMerchantsFilter'
import type { MerchantsFilterForm } from '@/lib/validations/merchantsFilter'

export interface ApprovedCheckoutCounterInput {
  location_id: number
  description: string
  alias_value?: string
}

export async function getMerchants(params: AllMerchantsFilterForm | MerchantsFilterForm) {
  const response = await instance.get<{ data: MerchantDetails[]; totalPages: number }>(
    '/merchants',
    {
      params,
    }
  )
  return response.data
}

export async function getMerchant(merchantId: number) {
  const response = await instance.get<{ data: MerchantDetails }>(
    `/merchants/${merchantId}`
  )
  return response.data.data
}

export async function addApprovedCheckoutCounter(
  merchantId: number,
  data: ApprovedCheckoutCounterInput,
  idempotencyKey: string
) {
  const response = await instance.post(
    `/merchants/${merchantId}/checkout-counters`,
    data,
    { headers: { 'Idempotency-Key': idempotencyKey } }
  )
  return response.data
}

export async function retryApprovedCheckoutCounterRegistration(
  merchantId: number,
  counterId: number
) {
  const response = await instance.post(
    `/merchants/${merchantId}/checkout-counters/${counterId}/registration`
  )
  return response.data
}

export async function approveMerchants(selectedMerchantIds: number[]) {
  const response = await instance.put('/merchants/bulk-approve', {
    ids: selectedMerchantIds,
  })
  return response.data
}

export async function rejectMerchants(selectedMerchantIds: number[], reason: string) {
  const response = await instance.put('/merchants/bulk-reject', {
    ids: selectedMerchantIds,
    reason,
  })
  return response.data
}

export async function revertMerchants(selectedMerchantIds: number[], reason: string) {
  const response = await instance.put('/merchants/bulk-revert', {
    ids: selectedMerchantIds,
    reason,
  })
  return response.data
}

export async function exportMerchants(
  params: AllMerchantsFilterForm | MerchantsFilterForm
) {
  const response = await instance.get<Blob>(`/merchants/export-with-filter`, {
    params,
    responseType: 'blob',
  })
  return response.data
}
