import { render, screen } from '@testing-library/react'

import TestWrapper from '@/__tests__/TestWrapper'
import {
  filterNavItemsByPermissions,
  default as NavItemsProvider,
  useNavItems,
} from './NavItemsContext'

describe('NavItemsContext', () => {
  function TestComponent() {
    return useNavItems() ? 'Context' : null
  }

  it('returns context inside NavItemsProvider', () => {
    render(
      <TestWrapper>
        <NavItemsProvider>
          <TestComponent />
        </NavItemsProvider>
      </TestWrapper>
    )

    expect(screen.getByText('Context')).toBeInTheDocument()
  })
})

describe('filterNavItemsByPermissions', () => {
  it.each<{
    role: string
    permissions: string[]
    routes: string[]
    portalRoutes?: string[]
  }>([
    {
      role: 'operator',
      permissions: ['Create Merchants', 'View Merchants', 'View Portal Users'],
      routes: ['Registry', 'Merchant Records', 'Portal User Management'],
      portalRoutes: ['User Management'],
    },
    {
      role: 'auditor',
      permissions: ['View Merchants', 'View Portal Users', 'View Audit Logs'],
      routes: ['Merchant Records', 'Portal User Management', 'Audit Log'],
      portalRoutes: ['User Management'],
    },
    {
      role: 'admin',
      permissions: [
        'Create DFSPs',
        'View DFSPs',
        'Create Merchants',
        'View Merchants',
        'View Portal Users',
        'View Roles',
        'View Audit Logs',
      ],
      routes: [
        'Onboarding DFSP',
        'DFSP List',
        'Registry',
        'Merchant Records',
        'Portal User Management',
        'Audit Log',
      ],
      portalRoutes: ['Role Management', 'User Management'],
    },
  ])('returns only routes allowed for a $role', ({ permissions, routes, portalRoutes }) => {
    const navItems = filterNavItemsByPermissions(permissions)
    const portalUserManagement = navItems.find(
      item => item.name === 'Portal User Management'
    )

    expect(navItems.map(item => item.name)).toEqual(routes)
    expect(portalUserManagement?.subNavItems?.map(item => item.name)).toEqual(
      portalRoutes
    )
  })

  it('returns no routes without permissions', () => {
    expect(filterNavItemsByPermissions([])).toEqual([])
  })
})
