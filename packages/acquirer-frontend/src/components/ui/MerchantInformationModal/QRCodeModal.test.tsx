import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import QRCodeModal from './QRCodeModal'

const mocks = vi.hoisted(() => ({ downloadBlob: vi.fn() }))

vi.mock('@/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils')>()),
  downloadBlob: mocks.downloadBlob,
}))

describe('QRCodeModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloads the displayed QR image', async () => {
    const qrImage = new Blob(['qr'], { type: 'image/png' })
    const fetchImage = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(qrImage),
    })
    vi.stubGlobal('fetch', fetchImage)

    render(
      <TestWrapper>
        <QRCodeModal
          isOpen
          onClose={vi.fn()}
          qrCodeUrl='https://storage.example/qr_images/LBR-MER-0001234.png?signature=1'
        />
      </TestWrapper>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save image' }))

    await waitFor(() => {
      expect(fetchImage).toHaveBeenCalledWith(
        'https://storage.example/qr_images/LBR-MER-0001234.png?signature=1'
      )
      expect(mocks.downloadBlob).toHaveBeenCalledWith(
        qrImage,
        'LBR-MER-0001234.png'
      )
    })
  })
})
