import { useRef, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Box,
  Heading,
  HStack,
  ListItem,
  Spinner,
  Text,
  UnorderedList,
} from '@chakra-ui/react'
import { isAxiosError } from 'axios'

import { useDraftCount } from '@/api/hooks/forms'
import {
  useBulkMerchantTemplate,
  useBulkMerchantUpload,
} from '@/api/hooks/merchants'
import type {
  BulkMerchantImportResult,
  BulkMerchantWorkbookError,
} from '@/api/merchants'
import { CustomButton, CustomLink } from '@/components/ui'
import { downloadBlob } from '@/utils'

const MAX_WORKBOOK_BYTES = 5 * 1024 * 1024

function newIdempotencyKey() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const Registry = () => {
  const draftCount = useDraftCount()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const idempotencyKeyRef = useRef(newIdempotencyKey())
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [result, setResult] = useState<BulkMerchantImportResult | null>(null)
  const [uploadErrors, setUploadErrors] = useState<BulkMerchantWorkbookError[]>([])
  const [uploadMessage, setUploadMessage] = useState('')
  const bulkUpload = useBulkMerchantUpload()
  const template = useBulkMerchantTemplate()

  const chooseFile = () => fileInputRef.current?.click()

  const resetUploadFeedback = () => {
    setResult(null)
    setUploadErrors([])
    setUploadMessage('')
  }

  const selectFile = (file: File | null) => {
    resetUploadFeedback()
    if (file === null) {
      setSelectedFile(null)
      return
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setSelectedFile(null)
      setUploadMessage('Choose an XLSX workbook.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > MAX_WORKBOOK_BYTES) {
      setSelectedFile(null)
      setUploadMessage('Workbook cannot exceed 5 MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setSelectedFile(file)
    idempotencyKeyRef.current = newIdempotencyKey()
  }

  const clearSelectedFile = () => {
    selectFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadErrors = () => {
    const csvCell = (value: string | number) => {
      const rawValue = String(value)
      const safeValue = /^[=+\-@]/.test(rawValue) ? `'${rawValue}` : rawValue
      return `"${safeValue.replace(/"/g, '""')}"`
    }
    const rows = [
      ['Sheet', 'Row', 'Field', 'Message'],
      ...uploadErrors.map(error => [
        error.sheet,
        error.row,
        error.field,
        error.message,
      ]),
    ]
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n')
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      'merchant-import-errors.csv'
    )
  }

  const downloadTemplate = async () => {
    try {
      const blob = await template.mutateAsync()
      downloadBlob(blob, 'merchant-onboarding-template.xlsx')
    } catch {
      // The mutation displays the download error toast.
    }
  }

  const uploadWorkbook = async () => {
    if (!selectedFile || bulkUpload.isPending) return
    setResult(null)
    setUploadErrors([])
    setUploadMessage('')
    try {
      const response = await bulkUpload.mutateAsync({
        file: selectedFile,
        idempotencyKey: idempotencyKeyRef.current,
      })
      setResult(response.data)
    } catch (error) {
      if (isAxiosError(error)) {
        const responseErrors = error.response?.data?.errors
        setUploadErrors(Array.isArray(responseErrors) ? responseErrors : [])
        setUploadMessage(
          typeof error.response?.data?.message === 'string'
            ? error.response.data.message
            : 'Upload failed. Please check the workbook and try again.'
        )
      } else {
        setUploadMessage('Upload failed. Please try again.')
      }
    }
  }

  return (
    <Box px={{ base: '4', sm: '6', lg: '8' }} pt='6' pb='14'>
      <Heading size='md' mb='10'>
        Merchant Acquiring System
      </Heading>

      <Heading as='h3' size='sm' fontWeight='medium' mb='5'>
        Fill in the merchant registry form
      </Heading>

      <CustomLink
        to='/registry/registry-form'
        mr='4'
        onClick={() => {
          localStorage.removeItem('merchantId')
        }}
      >
        Add new record
      </CustomLink>

      <Box position='relative' display='inline-block' mt={{ base: '3', sm: 'none' }}>
        <CustomLink
          to='/registry/draft-applications'
          isDisabled={!(typeof draftCount.data === 'number') || draftCount.data === 0}
          w='12.5rem'
        >
          {draftCount.isLoading ? (
            <Spinner data-testid='spinner' color='white' size='xs' />
          ) : (
            'Continue with saved draft'
          )}
        </CustomLink>

        {typeof draftCount.data === 'number' && draftCount.data > 0 && (
          <Box
            as='span'
            w='6'
            h='6'
            position='absolute'
            top='-3'
            right='-2.5'
            display='flex'
            justifyContent='center'
            alignItems='center'
            bg='accent'
            color='white'
            fontSize='0.65rem'
            fontWeight='bold'
            rounded='full'
            borderWidth='0.8px'
            borderColor='secondary'
            shadow='md'
            data-testid='draft-count'
          >
            {draftCount.data}
          </Box>
        )}
      </Box>

      <Heading as='h3' size='sm' fontWeight='medium' mt='10' mb='5'>
        Import bulk record file
      </Heading>

      <input
        ref={fileInputRef}
        type='file'
        accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        hidden
        aria-label='Merchant onboarding workbook'
        onChange={event => {
          const file = event.target.files?.[0] ?? null
          selectFile(file)
        }}
      />

      <HStack spacing='3' align='center' flexWrap='wrap'>
        <CustomButton
          colorVariant='accent-outline'
          onClick={chooseFile}
          isDisabled={bulkUpload.isPending}
        >
          Choose XLSX file
        </CustomButton>
        <CustomButton
          onClick={uploadWorkbook}
          isDisabled={!selectedFile || bulkUpload.isPending}
          isLoading={bulkUpload.isPending}
          loadingText='Uploading'
        >
          Upload merchants
        </CustomButton>
        {selectedFile && (
          <>
            <Text fontSize='sm'>
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </Text>
            <CustomButton
              colorVariant='danger'
              onClick={clearSelectedFile}
              isDisabled={bulkUpload.isPending}
            >
              Remove file
            </CustomButton>
          </>
        )}
      </HStack>

      <Box mt='6'>
        <Text mb='2' fontSize='sm' maxW='48rem'>
          Download the guided template and complete Merchants and Locations first.
          Dropdowns help fill supported codes and references across the remaining sheets.
          Upload one XLSX file up to 5 MB. The import is all-or-nothing and successful
          records enter the normal review queue.
        </Text>
        <CustomButton
          colorVariant='accent-outline'
          onClick={downloadTemplate}
          isLoading={template.isPending}
          loadingText='Downloading'
        >
          Download Excel template
        </CustomButton>
      </Box>

      {result && (
        <Alert status='success' mt='6' alignItems='flex-start'>
          <AlertIcon />
          <Box>
            <AlertTitle>Import completed</AlertTitle>
            <AlertDescription>
              {result.merchants_created} merchant(s), {result.locations_created}{' '}
              location(s), and {result.checkout_counters_created} checkout counter(s)
              were sent for review.
            </AlertDescription>
          </Box>
        </Alert>
      )}

      {uploadMessage && (
        <Alert status='error' mt='6' alignItems='flex-start'>
          <AlertIcon />
          <Box>
            <AlertTitle>{uploadMessage}</AlertTitle>
            {uploadErrors.length > 0 && (
              <AlertDescription>
                <UnorderedList mt='2' spacing='1'>
                  {uploadErrors.slice(0, 20).map((error, index) => (
                    <ListItem key={`${error.sheet}-${error.row}-${error.field}-${index}`}>
                      {error.sheet || 'Workbook'}
                      {error.row > 0 ? ` row ${error.row}` : ''}
                      {error.field ? `, ${error.field}` : ''}: {error.message}
                    </ListItem>
                  ))}
                </UnorderedList>
                {uploadErrors.length > 20 && (
                  <Text mt='2'>And {uploadErrors.length - 20} more error(s).</Text>
                )}
                <CustomButton
                  mt='3'
                  colorVariant='accent-outline'
                  onClick={downloadErrors}
                >
                  Download all errors
                </CustomButton>
              </AlertDescription>
            )}
          </Box>
        </Alert>
      )}
    </Box>
  )
}

export default Registry
