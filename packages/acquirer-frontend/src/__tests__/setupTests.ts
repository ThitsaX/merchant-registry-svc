import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, expect, vi } from 'vitest'

import '@testing-library/jest-dom'

expect.extend(matchers)

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}

// Node 24+ exposes optional storage globals that require a CLI file. Use
// isolated in-memory browser storage in tests instead of runner-level state.
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
})
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: createMemoryStorage(),
})

beforeAll(() => {
  // Create a container element for Chakra UI portals
  const portalRoot = document.createElement('div')
  portalRoot.setAttribute('id', 'chakra-portal-root')
  document.body.appendChild(portalRoot)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
