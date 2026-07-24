import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import ChangePassword from './ChangePassword'

const mockChangePassword = vi.fn()
vi.mock('@/api/hooks/auth', () => ({
  useChangePassword: () => ({
    isPending: false,
    mutate: mockChangePassword,
  }),
}))

vi.mock('@/utils', () => ({
  isTokenExpired: () => false,
}))

describe('ChangePassword', () => {
  it('submits the temporary and new passwords', async () => {
    localStorage.setItem('token', 'token')
    render(
      <TestWrapper>
        <ChangePassword />
      </TestWrapper>
    )

    fireEvent.change(screen.getByLabelText('Temporary password'), {
      target: { value: 'Temporary_234A' },
    })
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password-234' },
    })
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password-234' },
    })
    fireEvent.click(screen.getByText('Change password'))

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: 'Temporary_234A',
        newPassword: 'new-password-234',
      })
    })
  })
})
