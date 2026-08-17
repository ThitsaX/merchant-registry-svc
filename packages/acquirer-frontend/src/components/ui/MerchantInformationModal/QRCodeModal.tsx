import { useState } from 'react'
import {
  Heading,
  Image,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useToast,
} from '@chakra-ui/react'

import { downloadBlob } from '@/utils'
import CustomButton from '../CustomButton/CustomButton'
import Skeleton from '../Skeleton/Skeleton'

interface QRCodeModalProps {
  isOpen: boolean
  onClose: () => void
  qrCodeUrl: string
}

function qrCodeFilename(qrCodeUrl: string): string {
  try {
    const pathFilename = decodeURIComponent(
      new URL(qrCodeUrl, window.location.href).pathname.split('/').pop() ?? ''
    ).replace(/[/\\?%*:|"<>]/g, '_')

    if (pathFilename.length === 0) return 'merchant-qr-code.png'
    return pathFilename.toLowerCase().endsWith('.png')
      ? pathFilename
      : `${pathFilename}.png`
  } catch {
    return 'merchant-qr-code.png'
  }
}

const QRCodeModal = ({ isOpen, onClose, qrCodeUrl }: QRCodeModalProps) => {
  const [isSaving, setIsSaving] = useState(false)
  const toast = useToast()

  const saveImage = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const response = await fetch(qrCodeUrl)
      if (!response.ok) throw new Error('QR image request failed')
      downloadBlob(await response.blob(), qrCodeFilename(qrCodeUrl))
    } catch {
      toast({
        title: 'Saving QR image failed',
        description: 'Please try again.',
        status: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay bg='hsl(0, 0%, 100%, 0.6)' backdropFilter='blur(4px)' />

      <ModalContent w='90vw' maxW='26rem' mt='14'>
        <ModalHeader py='3' borderBottom='1px' borderColor='gray.100'>
          <Heading as='h3' size='md'>
            Scan QR Code
          </Heading>
        </ModalHeader>
        <ModalCloseButton top='2.5' right='4' />

        <ModalBody py='5' px={{ base: '4', md: '6' }}>
          <Image
            src={qrCodeUrl}
            fallback={<Skeleton h='490px' />}
            alt='QR Code'
            h='490px'
            w='100%'
            objectFit='contain'
          />
        </ModalBody>

        <ModalFooter pt='0'>
          <CustomButton
            onClick={() => void saveImage()}
            isLoading={isSaving}
            loadingText='Saving'
          >
            Save image
          </CustomButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default QRCodeModal
