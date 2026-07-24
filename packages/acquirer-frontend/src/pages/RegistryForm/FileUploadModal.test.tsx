import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import { vi } from 'vitest'

import TestWrapper from '@/__tests__/TestWrapper'
import FileUploadModal from './FileUploadModal'

const onClose = vi.fn()
const openFileInput = vi.fn()
const setFile = vi.fn()
const setIsUploading = vi.fn()

const renderModal = () =>
  render(
    <TestWrapper>
      <FileUploadModal
        isOpen
        onClose={onClose}
        isUploading
        setIsUploading={setIsUploading}
        openFileInput={openFileInput}
        setFile={setFile}
      />
    </TestWrapper>
  )

describe('FileUploadModal', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops uploading when progress reaches 100', () => {
    vi.useFakeTimers()
    renderModal()

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(setIsUploading).toHaveBeenCalledWith(false)
  })

  it('resets upload state when the modal is closed', () => {
    renderModal()

    fireEvent.click(screen.getByLabelText('Close'))

    expect(setIsUploading).toHaveBeenCalledWith(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('resets upload state when Submit is clicked', () => {
    vi.useFakeTimers()
    renderModal()

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    fireEvent.click(screen.getByText('Submit'))

    expect(setIsUploading).toHaveBeenCalledWith(false)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('accepts a dropped PDF and starts uploading it', () => {
    renderModal()
    const file = new File(['pdf'], 'license.pdf', { type: 'application/pdf' })

    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [file] },
    })

    expect(setIsUploading).toHaveBeenNthCalledWith(1, false)
    expect(setFile).toHaveBeenCalledWith(file)
    expect(setIsUploading).toHaveBeenNthCalledWith(2, true)
  })

  it('rejects a dropped file with the wrong type', () => {
    renderModal()
    const file = new File(['image'], 'license.png', { type: 'image/png' })

    fireEvent.drop(screen.getByTestId('dropzone'), {
      dataTransfer: { files: [file] },
    })

    expect(setIsUploading).toHaveBeenCalledWith(false)
    expect(setFile).not.toHaveBeenCalled()
  })

  it('shows the drag-over state', () => {
    renderModal()
    const dropzone = screen.getByTestId('dropzone')

    fireEvent.dragEnter(dropzone)

    expect(dropzone).toHaveClass('dragging-over')
  })
})
