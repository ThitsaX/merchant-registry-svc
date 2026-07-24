import {
  Alert,
  AlertDescription,
  AlertIcon,
  Code,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  useClipboard,
} from '@chakra-ui/react'

import type { EmailDelivery } from '@/types/users'
import CustomButton from '../CustomButton/CustomButton'

type TemporaryPasswordModalProps = {
  isOpen: boolean
  userEmail: string
  temporaryPassword: string
  emailDelivery: EmailDelivery
  onClose: () => void
}

const TemporaryPasswordModal = ({
  isOpen,
  userEmail,
  temporaryPassword,
  emailDelivery,
  onClose,
}: TemporaryPasswordModalProps) => {
  const { hasCopied, onCopy } = useClipboard(temporaryPassword)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnEsc={false}
      closeOnOverlayClick={false}
      isCentered
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Temporary password</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Stack spacing='4'>
            <Alert status='warning' alignItems='start'>
              <AlertIcon />
              <AlertDescription>
                This password is shown only once. Copy it before closing this window
                and share it through a secure channel.
              </AlertDescription>
            </Alert>

            <Text>
              Account: <strong>{userEmail}</strong>
            </Text>

            <Code
              px='4'
              py='3'
              fontSize='lg'
              textAlign='center'
              wordBreak='break-all'
              data-testid='temporary-password'
            >
              {temporaryPassword}
            </Code>

            <Text color='gray.600' fontSize='sm'>
              {emailDelivery.status === 'sent'
                ? 'An account notification was emailed, but the password was not included.'
                : 'No email containing this password was sent.'}
            </Text>
          </Stack>
        </ModalBody>
        <ModalFooter gap='3'>
          <CustomButton onClick={onCopy}>
            {hasCopied ? 'Copied' : 'Copy password'}
          </CustomButton>
          <CustomButton colorVariant='accent-outline' onClick={onClose}>
            Done
          </CustomButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default TemporaryPasswordModal
