import { render, screen } from '@testing-library/react'

import TestWrapper from '@/__tests__/TestWrapper'
import DrawerDisclosureProvider, {
  useDrawerDisclosure,
} from './DrawerDisclosureContext'

describe('DrawerDiscolsureContext', () => {
  function TestComponent() {
    const context = useDrawerDisclosure()

    return context ? 'Context' : null
  }

  it('should return context when "useDrawerDisclosure" hook is called inside "DrawerDisclosureProvider"', () => {
    render(
      <TestWrapper>
        <DrawerDisclosureProvider>
          <TestComponent />
        </DrawerDisclosureProvider>
      </TestWrapper>
    )

    expect(screen.getByText('Context')).toBeInTheDocument()
  })
})
