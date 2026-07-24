import { generateTemporaryPassword } from '../../src/services/tempPassword'

describe('generateTemporaryPassword', () => {
  it('generates a strong password without ambiguous characters', () => {
    for (let index = 0; index < 50; index++) {
      const password = generateTemporaryPassword()
      expect(password).toHaveLength(16)
      expect(password).toMatch(/[a-z]/)
      expect(password).toMatch(/[A-Z]/)
      expect(password).toMatch(/[2-9]/)
      expect(password).toMatch(/[!@#$%^&*_\-+=]/)
      expect(password).not.toMatch(/[01IlO]/)
    }
  })

  it('rejects insecure requested lengths', () => {
    expect(() => generateTemporaryPassword(11)).toThrow(
      'Temporary passwords must be at least 12 characters'
    )
  })
})
