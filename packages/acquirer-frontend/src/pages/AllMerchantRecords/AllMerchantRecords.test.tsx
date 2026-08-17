import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import { AllMerchantRecords } from '..'

const hoistedValues = vi.hoisted(() => ({
  allMerchants: [
    {
      no: 1,
      dbaName: 'marco',
      registeredName: 'N/A',
      payintoAccountId: 'N/A',
      merchantType: 'Small Shop',
      town: 'Townsville',
      countrySubdivision: 'Western Australia',
      checkoutCounterCount: 2,
      registeredDfspName: 'DFSP 1',
      registrationStatus: 'Pending',
      maker: {
        id: 5,
        name: 'DFSP 1 Admin 1',
      },
    },
  ],
  users: [
    { id: 5, name: 'DFSP 1 Admin 1' },
    { id: 6, name: 'DFSP 1 Admin 2' },
  ],
}))

const mockAllMerchants = vi.fn()
const mockExportMerchants = vi.fn()
vi.mock('@/api/hooks/merchants', () => ({
  useAllMerchants: () => mockAllMerchants(),
  useExportMerchants: () => ({
    mutateAsync: mockExportMerchants,
  }),
  useMerchant: () => ({}),
}))

const mockUsers = vi.fn()
vi.mock('@/api/hooks/users', () => ({
  useUsers: () => mockUsers(),
}))

vi.mock('@/utils', () => ({
  downloadMerchantsBlobAsXlsx: () => vi.fn(),
}))

describe('AllMerchantRecords', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render form skeleton when users data is loading', () => {
    mockUsers.mockReturnValue({ data: null, isLoading: true })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    expect(screen.getByTestId('form-skeleton')).toBeInTheDocument()
  })

  it('should render filter form when users data is successfully loaded', () => {
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    expect(screen.getByTestId('filter-form')).toBeInTheDocument()
  })

  it('should render table skeleton when all merchants data is loading', () => {
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: null,
      isFetching: true,
      isSuccess: false,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    expect(screen.getByTestId('table-skeleton')).toBeInTheDocument()
  })

  it('should render table content when all merchants data is successfully loaded', () => {
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    expect(screen.getByTestId('table')).toBeInTheDocument()
    expect(screen.getAllByText('Checkout Counter Count').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    expect(screen.queryByText('Counter Description')).not.toBeInTheDocument()
    expect(screen.getByText('Export')).toBeInTheDocument()
  })

  it('should reset the filter form values when "Clear Filter" button is clicked', () => {
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
      refetch: () => vi.fn,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    const addedByInput: HTMLSelectElement = screen.getByLabelText('Added By')
    const approvedBy: HTMLSelectElement = screen.getByLabelText('Approved By')
    const addedTimeInput: HTMLInputElement = screen.getByLabelText('Added Time')
    const updatedTimeInput: HTMLInputElement = screen.getByLabelText('Updated Time')
    const dbaNameInput: HTMLInputElement = screen.getByLabelText('DBA Name')
    const merchantId: HTMLInputElement = screen.getByLabelText('Merchant ID')
    const payintoAccountId: HTMLInputElement = screen.getByLabelText('Payinto Account ID')
    const registrationStatus: HTMLSelectElement =
      screen.getByLabelText('Registration Status')

    fireEvent.change(addedByInput, { target: { value: 5 } })
    fireEvent.change(approvedBy, { target: { value: 6 } })
    fireEvent.change(addedTimeInput, { target: { value: '2021-01-01' } })
    fireEvent.change(updatedTimeInput, { target: { value: '2021-01-01' } })
    fireEvent.change(dbaNameInput, { target: { value: 'marco' } })
    fireEvent.change(merchantId, { target: { value: '123456' } })
    fireEvent.change(payintoAccountId, { target: { value: '123456' } })
    fireEvent.change(registrationStatus, { target: { value: 'Approved' } })

    const clearFilterButton = screen.getByText('Clear Filter')
    fireEvent.click(clearFilterButton)

    expect(addedByInput.value).toEqual('')
    expect(approvedBy.value).toEqual('')
    expect(addedTimeInput.value).toEqual('')
    expect(updatedTimeInput.value).toEqual('')
    expect(dbaNameInput.value).toEqual('')
    expect(merchantId.value).toEqual('')
    expect(payintoAccountId.value).toEqual('')
    expect(registrationStatus.value).toEqual('')
  })

  it('should call "allMerchants.refetch" function when the filter form is submitted', async () => {
    const refetch = vi.fn()
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
      refetch,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    const filterForm = screen.getByTestId('filter-form')
    fireEvent.submit(filterForm)

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  })

  it('should call "exportMerchants.mutateAsync" function when "Export" button is clicked', async () => {
    mockExportMerchants.mockResolvedValue(new Blob())
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
    })
    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    const exportButton = screen.getByText('Export')
    fireEvent.click(exportButton)

    await waitFor(() => expect(mockExportMerchants).toHaveBeenCalledTimes(1))
  })

  it('should render merchant info modal when "View Details" button is clicked', () => {
    mockUsers.mockReturnValue({ data: hoistedValues.users, isLoading: false })
    mockAllMerchants.mockReturnValue({
      data: { data: hoistedValues.allMerchants, totalPages: 1 },
      isFetching: false,
      isSuccess: true,
    })

    render(
      <TestWrapper>
        <AllMerchantRecords />
      </TestWrapper>
    )

    const table = screen.getByTestId('table')
    const viewDetailsButton = within(table).getByText('View Details')
    fireEvent.click(viewDetailsButton)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
