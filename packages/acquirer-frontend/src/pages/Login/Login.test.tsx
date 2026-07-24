import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import { Login } from '..'

const mockLogin = vi.fn()
vi.mock('@/api/hooks/auth', () => ({
  useLogin: () => ({
    isLoading: false,
    mutate: mockLogin,
  }),
}))

describe('Login', () => {
  it('should render the correct password toggle icon', () => {
    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    )

    let showPasswordIconButton = screen.getByLabelText('Show password')
    fireEvent.click(showPasswordIconButton)
    let hidePasswordIconButton: HTMLElement | null =
      screen.getByLabelText('Hide password')
    expect(hidePasswordIconButton).toBeInTheDocument()

    fireEvent.click(hidePasswordIconButton)
    showPasswordIconButton = screen.getByLabelText('Show password')
    hidePasswordIconButton = screen.queryByLabelText('Hide password')
    expect(showPasswordIconButton).toBeInTheDocument()
    expect(hidePasswordIconButton).toBeNull()
  })

  it('submits the login credentials', async () => {
    render(
      <TestWrapper>
        <Login />
      </TestWrapper>
    )

    const emailInput: HTMLInputElement = screen.getByLabelText('Email')
    const passwordInput: HTMLInputElement = screen.getByLabelText('Password')
    const loginForm = screen.getByTestId('login-form')

    fireEvent.change(emailInput, { target: { value: 'john@gmail.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password' } })
    fireEvent.submit(loginForm)

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'john@gmail.com',
        password: 'password',
        recaptchaToken: '',
      })
    )
  })
})
