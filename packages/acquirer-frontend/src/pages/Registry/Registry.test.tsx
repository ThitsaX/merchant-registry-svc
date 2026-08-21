import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import { Registry } from '..'

const mockDraftCount = vi.fn()
const mockBulkUpload = vi.fn()
const mockBulkTemplate = vi.fn()
vi.mock('@/api/hooks/forms', () => ({
  useDraftCount: () => mockDraftCount(),
}))
vi.mock('@/api/hooks/merchants', () => ({
  useBulkMerchantUpload: () => mockBulkUpload(),
  useBulkMerchantTemplate: () => mockBulkTemplate(),
}))

describe('Registry', () => {
  beforeEach(() => {
    mockBulkUpload.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    })
    mockBulkTemplate.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should show loading spinner when draft count is loading', () => {
    mockDraftCount.mockReturnValue({ data: null, isLoading: true })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    expect(screen.getByTestId('spinner')).toBeInTheDocument()
  })

  it('should disable continue with saved draft button when draft count is 0', () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    expect(screen.getByText('Continue with saved draft')).toHaveStyle(
      'cursor: not-allowed'
    )
  })

  it('should render draft count when it is greater than 0', () => {
    mockDraftCount.mockReturnValue({ data: 3, isLoading: false })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    expect(screen.getByTestId('draft-count')).toHaveTextContent('3')
  })

  it('should remove merchantId from local storage when add new record button is clicked', () => {
    mockDraftCount.mockReturnValue({ data: 3, isLoading: false })
    const removeMerchantIdSpy = vi.spyOn(localStorage, 'removeItem')

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )
    localStorage.setItem('merchantId', '1')

    const addNewRecordBtn = screen.getByText('Add new record')
    fireEvent.click(addNewRecordBtn)

    expect(localStorage.getItem('merchantId')).toBeNull()
    expect(removeMerchantIdSpy).toHaveBeenCalledWith('merchantId')

    removeMerchantIdSpy.mockClear()
  })

  it('uploads a selected XLSX workbook and shows the import summary', async () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })
    const mutateAsync = vi.fn().mockResolvedValue({
      data: {
        merchants_created: 2,
        locations_created: 2,
        checkout_counters_created: 3,
      },
    })
    mockBulkUpload.mockReturnValue({ isPending: false, mutateAsync })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    const file = new File(['workbook'], 'merchants.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    fireEvent.change(screen.getByLabelText('Merchant onboarding workbook'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByText('Upload merchants'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      file,
      idempotencyKey: expect.any(String),
    }))
    expect(await screen.findByText(/2 merchant\(s\), 2 location\(s\)/)).toBeInTheDocument()
  })

  it('rejects a non-XLSX file before upload', () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    const file = new File(['not a workbook'], 'merchants.csv', {
      type: 'text/csv',
    })
    fireEvent.change(screen.getByLabelText('Merchant onboarding workbook'), {
      target: { files: [file] },
    })

    expect(screen.getByText('Choose an XLSX workbook.')).toBeInTheDocument()
    expect(screen.getByText('Upload merchants')).toBeDisabled()
  })

  it('rejects an XLSX file larger than 5 MB before upload', () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    const file = new File(['workbook'], 'merchants.xlsx')
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByLabelText('Merchant onboarding workbook'), {
      target: { files: [file] },
    })

    expect(screen.getByText('Workbook cannot exceed 5 MB.')).toBeInTheDocument()
    expect(screen.getByText('Upload merchants')).toBeDisabled()
  })

  it('clears a selected workbook', () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    const file = new File(['workbook'], 'merchants.xlsx')
    fireEvent.change(screen.getByLabelText('Merchant onboarding workbook'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByText('Remove file'))

    expect(screen.queryByText('Remove file')).not.toBeInTheDocument()
    expect(screen.getByText('Upload merchants')).toBeDisabled()
  })

  it('downloads every workbook validation error as CSV', async () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })
    const mutateAsync = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          message: 'Workbook validation failed.',
          errors: [{
            sheet: 'Merchants',
            row: 2,
            field: 'currency_code',
            message: 'Currency is not supported',
          }],
        },
      },
    })
    mockBulkUpload.mockReturnValue({ isPending: false, mutateAsync })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:errors')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )

    const file = new File(['workbook'], 'merchants.xlsx')
    fireEvent.change(screen.getByLabelText('Merchant onboarding workbook'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByText('Upload merchants'))
    fireEvent.click(await screen.findByText('Download all errors'))

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('downloads the authenticated Excel template', async () => {
    mockDraftCount.mockReturnValue({ data: 0, isLoading: false })
    const templateBlob = new Blob(['template'])
    const mutateAsync = vi.fn().mockResolvedValue(templateBlob)
    mockBulkTemplate.mockReturnValue({ isPending: false, mutateAsync })
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:template')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    render(
      <TestWrapper>
        <Registry />
      </TestWrapper>
    )
    fireEvent.click(screen.getByText('Download Excel template'))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1))
  })
})
