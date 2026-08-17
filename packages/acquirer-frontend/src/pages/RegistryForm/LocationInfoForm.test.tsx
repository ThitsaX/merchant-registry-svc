import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import type { MerchantDetails } from '@/types/merchantDetails'
import { createLocationInfoMerchant } from '@/__tests__/fixtures/merchantDetails'
import TestWrapper from '@/__tests__/TestWrapper'
import { locationInfoSchema } from '@/lib/validations/registry'
import LocationInfoForm from './LocationInfoForm'

const draft = createLocationInfoMerchant()
const fn = vi.fn()
const mockMerchantId = vi.fn()

vi.mock('@chakra-ui/react', async () => {
  const chakraUI: object = await vi.importActual('@chakra-ui/react')

  return {
    ...chakraUI,
    useToast: () => {
      return () => fn('toast')
    },
  }
})

vi.mock('@/hooks', () => ({
  useMerchantId: () => mockMerchantId(),
}))

let draftData: MerchantDetails | null = null
let locationMutationError: unknown = null

interface MutationOptions {
  onError?: (error: unknown) => void
}

vi.mock('@/api/hooks/forms', () => ({
  useCountries: () => ({ data: ['Australia'], isLoading: false }),
  useSubdivisions: () => ({ data: ['Western Australia'], isFetching: false }),
  useDistricts: () => ({ data: ['Perth'], isFetching: false }),
  useDraft: () => ({
    get data() {
      return draftData
    },
    isFetching: false,
  }),
  useCreateLocationInfo: () => ({
    mutate: (payload: unknown, options?: MutationOptions) => {
      fn('createLocationInfo', payload)
      if (locationMutationError) options?.onError?.(locationMutationError)
    },
    isPending: false,
  }),
  useUpdateLocationInfo: () => ({
    mutate: (payload: unknown, options?: MutationOptions) => {
      fn('updateLocationInfo', payload)
      if (locationMutationError) options?.onError?.(locationMutationError)
    },
    isPending: false,
  }),
}))

const mockSetActiveStep = vi.fn()

describe('LocationInfoForm', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    draftData = null
    locationMutationError = null
  })

  beforeEach(() => {
    fn.mockClear()
  })

  it('should focus the first input which has an error when the validation fails', async () => {
    draftData = null

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const submitButton: HTMLButtonElement = screen.getByText('Save and Proceed')
    fireEvent.submit(submitButton)

    expect(await screen.findByLabelText(/Location Type/)).toEqual(document.activeElement)
    expect(screen.getByText('Country is required')).toBeInTheDocument()
    expect(screen.getByText('Township is required')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalledWith('createLocationInfo')
  })

  it('should fill with draft values when it is a draft', () => {
    draftData = draft

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const locationTypeInput: HTMLSelectElement = screen.getByLabelText(/Location Type/)
    const websiteUrlInput: HTMLInputElement = screen.getByLabelText('Website URL')
    const departmentInput: HTMLInputElement = screen.getByLabelText('Department')
    const subDepartmentInput: HTMLInputElement = screen.getByLabelText('Sub Department')
    const streetNameInput: HTMLInputElement = screen.getByLabelText('Street Name')
    const buildingNumberInput: HTMLInputElement = screen.getByLabelText('Building Number')
    const buildingNameInput: HTMLInputElement = screen.getByLabelText('Building Name')
    const floorNumberInput: HTMLInputElement = screen.getByLabelText('Floor Number')
    const roomNumberInput: HTMLInputElement = screen.getByLabelText('Room Number')
    const postBoxInput: HTMLInputElement = screen.getByLabelText('Post Box')
    const postalCodeInput: HTMLInputElement = screen.getByLabelText('Postal Code')
    const countryInput: HTMLSelectElement = screen.getByLabelText(/Country/, {
      selector: '[name="country"]',
    })
    const countrySubdivisionInput: HTMLSelectElement = screen.getByLabelText(
      'Country Subdivision (State/Divison)'
    )
    const districtInput: HTMLSelectElement = screen.getByLabelText('District')
    const townshipInput: HTMLInputElement = screen.getByLabelText(/Township/, {
      selector: '[name="town_name"]',
    })
    const longitudeInput: HTMLInputElement = screen.getByLabelText('Longitude')
    const latitudeInput: HTMLInputElement = screen.getByLabelText('Latitude')
    const checkoutCounterDescriptionInput: HTMLInputElement =
      screen.getByLabelText(/Checkout Counter Description/)

    expect(locationTypeInput.value).toEqual('Virtual')
    expect(websiteUrlInput.value).toEqual('https://www.example.com')
    expect(departmentInput.value).toEqual('Sale')
    expect(subDepartmentInput.value).toEqual('Support')
    expect(streetNameInput.value).toEqual('Main Street')
    expect(buildingNumberInput.value).toEqual('123')
    expect(buildingNameInput.value).toEqual('Big Building')
    expect(floorNumberInput.value).toEqual('4')
    expect(roomNumberInput.value).toEqual('101')
    expect(postBoxInput.value).toEqual('PO Box 123')
    expect(postalCodeInput.value).toEqual('12345')
    expect(countryInput.value).toEqual('Australia')
    expect(countrySubdivisionInput.value).toEqual('Western Australia')
    expect(districtInput.value).toEqual('Perth')
    expect(townshipInput.value).toEqual('Townsville')
    expect(longitudeInput.value).toEqual('99')
    expect(latitudeInput.value).toEqual('331')
    expect(checkoutCounterDescriptionInput.value).toEqual('-')
  })

  it('edits the primary alias only on the checkout-counter step', () => {
    draftData = createLocationInfoMerchant({
      locations: [],
      checkout_counters: [{
        ...draft.checkout_counters[0],
        alias_value: 'LBR-MER-0001234',
      }],
    })

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    expect(screen.getByLabelText(/Primary Checkout Counter Alias/)).toHaveValue(
      'LBR-MER-0001234'
    )
  })

  it('rejects duplicate aliases within the counter form', () => {
    const result = locationInfoSchema.safeParse({
      location_type: 'Physical',
      country: 'Liberia',
      town_name: 'Monrovia',
      checkout_counters: [
        { description: 'Main till', alias_value: 'COUNTER-ALIAS' },
        { description: 'Express till', alias_value: 'counter-alias' },
      ],
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toContainEqual(expect.objectContaining({
      path: ['checkout_counters', 1, 'alias_value'],
      message: 'Alias "counter-alias" is entered more than once',
    }))
  })

  it('shows a server-side duplicate alias error on the affected counter', async () => {
    draftData = createLocationInfoMerchant({
      checkout_counters: [
        draft.checkout_counters[0],
        {
          ...draft.checkout_counters[0],
          id: 2,
          counter_number: 2,
          description: 'Express till',
          alias_value: '',
        },
      ],
    })
    mockMerchantId.mockReturnValue(1)
    locationMutationError = {
      isAxiosError: true,
      response: {
        data: {
          field: 'checkout_counters.1.alias_value',
          message: 'Checkout counter alias "COUNTER-EXISTING" is already registered',
        },
      },
    }

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    fireEvent.change(screen.getByLabelText(/Custom Counter Alias/), {
      target: { value: 'COUNTER-EXISTING' },
    })
    fireEvent.click(screen.getByText('Save and Proceed'))

    expect(await screen.findByText(
      'Checkout counter alias "COUNTER-EXISTING" is already registered'
    )).toBeInTheDocument()
  })

  it('should reset the values of "Country Subdivision" and "District" when the value of "Country" is changed', () => {
    draftData = draft

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const countryInput: HTMLSelectElement = screen.getByLabelText(/Country/, {
      selector: '[name="country"]',
    })
    const countrySubdivisionInput: HTMLSelectElement = screen.getByLabelText(
      'Country Subdivision (State/Divison)'
    )
    const districtInput: HTMLSelectElement = screen.getByLabelText('District')

    fireEvent.change(countryInput, { target: { value: 'Belgium' } })

    expect(countrySubdivisionInput.value).toEqual('')
    expect(districtInput.value).toEqual('')
  })

  it('should reset the value of "District" when the value of "Country Subdivision" is changed', () => {
    draftData = draft

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const countrySubdivisionInput: HTMLSelectElement = screen.getByLabelText(
      'Country Subdivision (State/Divison)'
    )
    const districtInput: HTMLSelectElement = screen.getByLabelText('District')

    fireEvent.change(countrySubdivisionInput, { target: { value: 'Queensland' } })

    expect(districtInput.value).toEqual('')
  })

  it('should call "createLocationInfo.mutate" when it is not a draft', async () => {
    draftData = null
    mockMerchantId.mockReturnValue(1)

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const locationTypeInput: HTMLSelectElement = screen.getByLabelText(/Location Type/)
    const countryInput: HTMLSelectElement = screen.getByLabelText(/Country/, {
      selector: '[name="country"]',
    })
    const townshipInput: HTMLInputElement = screen.getByLabelText(/Township/, {
      selector: '[name="town_name"]',
    })
    const counterDescriptionInput: HTMLInputElement = screen.getByLabelText(
      /Checkout Counter Description/
    )
    const submitButton: HTMLButtonElement = screen.getByText('Save and Proceed')

    fireEvent.change(locationTypeInput, { target: { value: 'Virtual' } })
    fireEvent.change(countryInput, { target: { value: 'Australia' } })
    fireEvent.change(townshipInput, { target: { value: 'Perth' } })
    fireEvent.change(counterDescriptionInput, { target: { value: 'Main till' } })
    fireEvent.click(submitButton)

    await waitFor(() =>
      expect(fn).toHaveBeenCalledWith(
        'createLocationInfo',
        expect.objectContaining({
          params: expect.objectContaining({
            checkout_counters: [
              expect.objectContaining({ description: 'Main till' }),
            ],
          }),
        })
      )
    )
  })

  it('should call "updateLocationInfo.mutate" when it is a draft', async () => {
    draftData = draft
    mockMerchantId.mockReturnValue(1)

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const submitButton: HTMLButtonElement = screen.getByText('Save and Proceed')
    fireEvent.click(submitButton)

    await waitFor(() =>
      expect(fn).toHaveBeenCalledWith(
        'updateLocationInfo',
        expect.objectContaining({
          params: expect.objectContaining({
            checkout_counters: [expect.objectContaining({ id: 1 })],
          }),
        })
      )
    )
  })

  it('should show an error toast when the merchantId is not found', async () => {
    draftData = draft
    mockMerchantId.mockReturnValue(null)

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    const submitButton: HTMLButtonElement = screen.getByText('Save and Proceed')
    fireEvent.click(submitButton)

    await waitFor(() => expect(fn).toHaveBeenCalledWith('toast'))
  })

  it('should add and submit multiple checkout counters', async () => {
    draftData = null
    mockMerchantId.mockReturnValue(1)

    render(
      <TestWrapper>
        <LocationInfoForm setActiveStep={mockSetActiveStep} />
      </TestWrapper>
    )

    fireEvent.change(screen.getByLabelText(/Location Type/), {
      target: { value: 'Physical' },
    })
    fireEvent.change(
      screen.getByLabelText(/Country/, { selector: '[name="country"]' }),
      { target: { value: 'Australia' } }
    )
    fireEvent.change(
      screen.getByLabelText(/Township/, { selector: '[name="town_name"]' }),
      { target: { value: 'Perth' } }
    )
    fireEvent.click(screen.getByText('Add counter'))

    const descriptions = screen.getAllByLabelText(/Checkout Counter Description/)
    fireEvent.change(descriptions[0], { target: { value: 'Main till' } })
    fireEvent.change(descriptions[1], { target: { value: 'Express till' } })
    fireEvent.click(screen.getByText('Save and Proceed'))

    await waitFor(() => {
      const payload = fn.mock.calls.find(call => call[0] === 'createLocationInfo')?.[1]
      expect(payload).toEqual(expect.objectContaining({
        params: expect.objectContaining({
          checkout_counters: [
            expect.objectContaining({ description: 'Main till' }),
            expect.objectContaining({ description: 'Express till' }),
          ],
        }),
      }))
    })
  })
})
