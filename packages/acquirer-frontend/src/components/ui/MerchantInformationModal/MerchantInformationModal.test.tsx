import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import { MerchantInformationModal } from '..'
import type { MerchantDetails } from '@/types/merchantDetails'
import { MerchantInfo } from './MerchantInformationModal'

const hoistedValues = vi.hoisted(() => ({
  merchant: {
    business_licenses: [
      {
        license_document_link: 'http://example.com',
      },
    ],
    business_owners: [],
    category_code: {},
    checkout_counters: [
      {
        id: 1,
        description: 'Main till',
        alias_value: 'MAIN-TILL',
        qr_code_link: null,
      },
      {
        id: 2,
        description: 'Express till',
        alias_value: 'EXPRESS-TILL',
        qr_code_link: null,
      },
    ],
    contact_persons: [],
    currency_code: {},
    dba_trading_name: 'marco',
    employees_num: '6 - 10',
    id: 1,
    locations: [],
    merchant_type: 'Individual',
    monthly_turnover: '',
    registered_name: '',
    registration_status: 'Draft',
    registration_status_reason: 'Draft Merchant by d1superadmin1@email.com',
  },
}))

const mockMerchant = vi.fn()
vi.mock('@/api/hooks/merchants', () => ({
  useMerchant: () => mockMerchant(),
  useAddApprovedCheckoutCounter: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useRetryApprovedCheckoutCounterRegistration: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
}))

vi.mock('@/api/hooks/users', () => ({
  useUserProfile: () => ({
    data: { role: { permissions: [] } },
  }),
}))

describe('MerchantInformationModal', () => {
  it('should render skeleton loading when merchant data is loading', () => {
    mockMerchant.mockReturnValue({ data: null, isLoading: true, isSuccess: false })

    render(
      <TestWrapper>
        <MerchantInformationModal isOpen onClose={() => vi.fn()} selectedMerchantId={1} />
      </TestWrapper>
    )

    expect(screen.getByTestId('skeleton-loading')).toBeInTheDocument()
  })

  it('should render merchant information when merchant data is successfully loaded', () => {
    mockMerchant.mockReturnValue({
      data: hoistedValues.merchant,
      isLoading: false,
      isSuccess: true,
    })

    render(
      <TestWrapper>
        <MerchantInformationModal isOpen onClose={() => vi.fn()} selectedMerchantId={1} />
      </TestWrapper>
    )

    expect(screen.getByTestId('merchant-information')).toBeInTheDocument()
    expect(screen.getByTestId('license-document-link')).toBeInTheDocument()
    expect(screen.getAllByTestId('checkout-counter-information')).toHaveLength(2)
    expect(screen.getByText('Main till')).toBeInTheDocument()
    expect(screen.getByText('Express till')).toBeInTheDocument()
  })

  it('offers the add-counter action for an approved merchant with edit permission', () => {
    render(
      <TestWrapper>
        <MerchantInfo
          merchantDetails={{
            ...hoistedValues.merchant,
            registration_status: 'Approved',
            locations: [{ id: 7, town_name: 'Monrovia', country: 'Liberia' }],
          } as unknown as MerchantDetails}
          canManageCheckoutCounters
        />
      </TestWrapper>
    )

    expect(
      screen.getByRole('button', { name: 'Add Checkout Counter' })
    ).toBeInTheDocument()
  })
})
