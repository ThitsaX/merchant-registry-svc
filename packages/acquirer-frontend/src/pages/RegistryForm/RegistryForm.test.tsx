import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import { RegistryForm } from '..'

const mockStep = vi.fn()
vi.mock('@chakra-ui/react', async () => {
  const charaUI: object = await vi.importActual('@chakra-ui/react')

  return {
    ...charaUI,
    useSteps: () => ({ activeStep: mockStep(), setActiveStep: vi.fn() }),
  }
})

vi.mock('./BusinessInfoForm', () => ({
  default: () => <div data-testid='business-info-form' />,
}))
vi.mock('./LocationInfoForm', () => ({
  default: () => <div data-testid='location-info-form' />,
}))
vi.mock('./OwnerInfoForm', () => ({
  default: () => <div data-testid='owner-info-form' />,
}))
vi.mock('./ContactPersonForm', () => ({
  default: () => <div data-testid='contact-person-form' />,
}))

describe('RegistryForm', () => {
  it('should render business info form in step 1', () => {
    mockStep.mockReturnValue(1)

    render(
      <TestWrapper>
        <RegistryForm />
      </TestWrapper>
    )

    expect(screen.getByTestId('business-info-form')).toBeInTheDocument()
  })

  it('should render location info form in step 2', () => {
    mockStep.mockReturnValue(2)

    render(
      <TestWrapper>
        <RegistryForm />
      </TestWrapper>
    )

    expect(screen.getByTestId('location-info-form')).toBeInTheDocument()
  })

  it('should render owner info form in step 3', () => {
    mockStep.mockReturnValue(3)

    render(
      <TestWrapper>
        <RegistryForm />
      </TestWrapper>
    )

    expect(screen.getByTestId('owner-info-form')).toBeInTheDocument()
  })

  it('should render contact person form in step 4', () => {
    mockStep.mockReturnValue(4)

    render(
      <TestWrapper>
        <RegistryForm />
      </TestWrapper>
    )

    expect(screen.getByTestId('contact-person-form')).toBeInTheDocument()
  })
})
