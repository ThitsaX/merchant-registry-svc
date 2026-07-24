import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChakraProvider } from '@chakra-ui/react'

import theme from '@/theme'

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: Infinity, retry: false },
          mutations: { retry: false },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChakraProvider
          theme={theme}
          toastOptions={{
            defaultOptions: { variant: 'subtle', position: 'top', isClosable: true },
          }}
        >
          {children}
        </ChakraProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

export default TestWrapper
