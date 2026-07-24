module.exports = {
  projects: [
    {
      displayName: 'Integration Tests',
      testMatch: ['<rootDir>/__tests__/integration/integration.tests.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node'
    },
    {
      displayName: 'E2E Tests',
      testMatch: ['<rootDir>/__tests__/e2e/e2e.tests.ts'],
      preset: 'ts-jest',
      testEnvironment: 'node'
    }
  ]
}
