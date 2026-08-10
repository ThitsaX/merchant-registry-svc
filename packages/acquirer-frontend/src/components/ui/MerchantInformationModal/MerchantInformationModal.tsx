import { useRef, useState } from 'react'
import {
  Box,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Text,
  useDisclosure,
  type GridItemProps,
  type HeadingProps,
} from '@chakra-ui/react'

import type { MerchantDetails } from '@/types/merchantDetails'
import { formatLatitudeLongitude } from '@/utils'
import {
  useAddApprovedCheckoutCounter,
  useMerchant,
  useRetryApprovedCheckoutCounterRegistration,
} from '@/api/hooks/merchants'
import { useUserProfile } from '@/api/hooks/users'
import { CustomButton, Skeleton } from '@/components/ui'
import { DetailsItem } from '.'
import QRCodeModal from './QRCodeModal'

interface MerchantInformationModalProps {
  selectedMerchantId: number
  isOpen: boolean
  onClose: () => void
}

export const SubHeading = ({ children, ...props }: HeadingProps) => {
  return (
    <Heading as='h4' size='sm' mb='4' fontWeight='semibold' {...props}>
      {children}
    </Heading>
  )
}

export const GridItemShell = ({ children, ...props }: GridItemProps) => {
  return (
    <GridItem bg='primaryBackground' rounded='md' px='4' py='3' {...props}>
      {children}
    </GridItem>
  )
}

export const MerchantInfo = ({
  merchantDetails,
  canManageCheckoutCounters = false,
}: {
  merchantDetails: MerchantDetails
  canManageCheckoutCounters?: boolean
}) => {
  const {
    dba_trading_name,
    lei,
    employees_num,
    monthly_turnover,
    category_code,
    mcc,
    merchant_type,
    default_dfsp,
    currency_code,
    business_licenses,
    checkout_counters,
    locations,
    business_owners,
    contact_persons,
    registration_status,
    registration_status_reason,
  } = merchantDetails

  const businessLicense = business_licenses?.[0]
  const primaryCheckoutCounter = checkout_counters?.[0]
  const location = locations?.[0]
  const businessOwner = business_owners?.[0]
  const contactPerson = contact_persons?.[0]

  const { isOpen, onOpen, onClose } = useDisclosure()
  const [selectedQrCodeUrl, setSelectedQrCodeUrl] = useState<string | null>(null)
  const [isAddingCounter, setIsAddingCounter] = useState(false)
  const [counterDescription, setCounterDescription] = useState('')
  const [counterAlias, setCounterAlias] = useState('')
  const [counterLocationId, setCounterLocationId] = useState(
    locations?.[0]?.id?.toString() ?? ''
  )
  const addCounter = useAddApprovedCheckoutCounter()
  const retryCounter = useRetryApprovedCheckoutCounterRegistration()
  const submissionLock = useRef(false)

  const canAddCounter =
    canManageCheckoutCounters &&
    registration_status === 'Approved' &&
    locations.length > 0 &&
    checkout_counters.length < 50

  const submitCounter = async () => {
    const locationId = Number(counterLocationId)
    if (
      submissionLock.current ||
      counterDescription.trim().length === 0 ||
      !Number.isInteger(locationId) ||
      locationId < 1
    ) {
      return
    }

    submissionLock.current = true
    try {
      await addCounter.mutateAsync({
        merchantId: merchantDetails.id,
        idempotencyKey: crypto.randomUUID(),
        data: {
          location_id: locationId,
          description: counterDescription.trim(),
          ...(counterAlias.trim().length > 0
            ? { alias_value: counterAlias.trim() }
            : {}),
        },
      })
      setCounterDescription('')
      setCounterAlias('')
      setIsAddingCounter(false)
    } finally {
      submissionLock.current = false
    }
  }

  const openQrCode = (qrCodeUrl: string) => {
    setSelectedQrCodeUrl(qrCodeUrl)
    onOpen()
  }

  const closeQrCode = () => {
    onClose()
    setSelectedQrCodeUrl(null)
  }

  return (
    <>
      {(registration_status === 'Reverted' || registration_status === 'Rejected') && (
        <Box bg='primaryBackground' mb='4' px='4' py='3' color='danger' rounded='md'>
          <Heading as='h4' size='sm' mb='3'>
            {registration_status} Reason
          </Heading>

          <Text fontSize='sm'>{registration_status_reason}</Text>
        </Box>
      )}

      <Grid
        templateRows={{ base: '1fr', lg: 'repeat(4, 1fr)' }}
        templateColumns={{
          base: 'repeat(1, minmax(200px, 1fr))',
          lg: 'repeat(2, 1fr)',
        }}
        gap='4'
        data-testid='merchant-information'
      >
        {/* c8 ignore next 215 */}
        <GridItemShell rowSpan={2}>
          <SubHeading>Business Information</SubHeading>

          <Stack spacing='3'>
            <DetailsItem
              label='Doing Business As Name'
              value={dba_trading_name || 'N/A'}
            />

            <DetailsItem label='LEI' value={lei || 'N/A'} />

            <DetailsItem
              label='Primary Payinto Account'
              value={primaryCheckoutCounter?.alias_value || 'N/A'}
            />

            <DetailsItem label='Number of Employee' value={employees_num || 'N/A'} />

            <DetailsItem
              label='Monthly Turnover'
              value={monthly_turnover ? `${monthly_turnover}%` : 'N/A'}
            />

            <DetailsItem
              label='Business Activity'
              value={category_code?.description || 'N/A'}
            />

            <DetailsItem label='Payment MCC' value={mcc || 'N/A'} />

            <DetailsItem label='Merchant Type' value={merchant_type || 'N/A'} />

            <DetailsItem label='DFSP Name' value={default_dfsp?.name || 'N/A'} />

            <DetailsItem label='Currency' value={currency_code?.iso_code || 'N/A'} />

            <DetailsItem
              label='Licence Number'
              value={businessLicense?.license_number || 'N/A'}
            />

            <DetailsItem
              label='Licence Document'
              value={
                businessLicense?.license_document_link ? (
                  <Link
                    href={businessLicense?.license_document_link}
                    download
                    color='blue.500'
                    data-testid='license-document-link'
                  >
                    License Document
                  </Link>
                ) : (
                  'N/A'
                )
              }
            />
          </Stack>
        </GridItemShell>

        <GridItemShell rowSpan={2}>
          <SubHeading>Location Information</SubHeading>

          <Stack spacing='3'>
            <DetailsItem label='Location Type' value={location?.location_type || 'N/A'} />

            <DetailsItem label='Country' value={location?.country || 'N/A'} />

            <DetailsItem
              label='Latitude Longitude'
              value={formatLatitudeLongitude(location?.latitude, location?.longitude)}
            />

            <DetailsItem label='Website URL' value={location?.web_url || 'N/A'} />

            <DetailsItem label='Department' value={location?.department || 'N/A'} />

            <DetailsItem
              label='Sub Department'
              value={location?.sub_department || 'N/A'}
            />

            <DetailsItem label='Street Name' value={location?.street_name || 'N/A'} />

            <DetailsItem
              label='Building Number'
              value={location?.building_number || 'N/A'}
            />

            <DetailsItem label='Building Name' value={location?.building_name || 'N/A'} />

            <DetailsItem label='Floor Number' value={location?.floor_number || 'N/A'} />

            <DetailsItem label='Room Number' value={location?.room_number || 'N/A'} />

            <DetailsItem label='Post Box' value={location?.post_box || 'N/A'} />

            <DetailsItem label='Postal Code' value={location?.postal_code || 'N/A'} />

            <DetailsItem label='Township' value={location?.town_name || 'N/A'} />

            <DetailsItem label='District' value={location?.district_name || 'N/A'} />

            <DetailsItem
              label='Country Subdivision'
              value={location?.country_subdivision || 'N/A'}
            />
          </Stack>
        </GridItemShell>

        <GridItemShell rowSpan={2}>
          <SubHeading>Business Owner Information</SubHeading>

          <Stack spacing='3'>
            <DetailsItem label='Name' value={businessOwner?.name || 'N/A'} />

            <DetailsItem
              label={businessOwner?.identificaton_type}
              value={businessOwner?.identification_number || 'N/A'}
            />

            <DetailsItem
              label='Phone Number'
              value={businessOwner?.phone_number || 'N/A'}
            />

            <DetailsItem label='Email' value={businessOwner?.email || 'N/A'} />

            <DetailsItem
              label='Country'
              value={businessOwner?.businessPersonLocation?.country || 'N/A'}
            />

            <DetailsItem
              label='Latitude Longitude'
              value={formatLatitudeLongitude(
                businessOwner?.businessPersonLocation?.latitude,
                businessOwner?.businessPersonLocation?.longitude
              )}
            />

            <DetailsItem
              label='Department'
              value={businessOwner?.businessPersonLocation?.department || 'N/A'}
            />

            <DetailsItem
              label='Sub Department'
              value={businessOwner?.businessPersonLocation?.sub_department || 'N/A'}
            />

            <DetailsItem
              label='Street Name'
              value={businessOwner?.businessPersonLocation?.street_name || 'N/A'}
            />

            <DetailsItem
              label='Building Number'
              value={businessOwner?.businessPersonLocation?.building_number || 'N/A'}
            />

            <DetailsItem
              label='Building Name'
              value={businessOwner?.businessPersonLocation?.building_name || 'N/A'}
            />

            <DetailsItem
              label='Floor Number'
              value={businessOwner?.businessPersonLocation?.floor_number || 'N/A'}
            />

            <DetailsItem
              label='Room Number'
              value={businessOwner?.businessPersonLocation?.room_number || 'N/A'}
            />

            <DetailsItem
              label='Post Box'
              value={businessOwner?.businessPersonLocation?.post_box || 'N/A'}
            />

            <DetailsItem
              label='Postal Code'
              value={businessOwner?.businessPersonLocation?.postal_code || 'N/A'}
            />

            <DetailsItem
              label='Township'
              value={businessOwner?.businessPersonLocation?.town_name || 'N/A'}
            />

            <DetailsItem
              label='District'
              value={businessOwner?.businessPersonLocation?.district_name || 'N/A'}
            />

            <DetailsItem
              label='Country Subdivision'
              value={businessOwner?.businessPersonLocation?.country_subdivision || 'N/A'}
            />
          </Stack>
        </GridItemShell>

        <GridItemShell>
          <SubHeading>Contact Person Information</SubHeading>

          <Stack spacing='3'>
            <DetailsItem label='Name' value={contactPerson?.name || 'N/A'} />

            <DetailsItem
              label='Phone Number'
              value={contactPerson?.phone_number || 'N/A'}
            />

            <DetailsItem label='Email' value={contactPerson?.email || 'N/A'} />
          </Stack>
        </GridItemShell>

        <GridItemShell>
          <SubHeading>Checkout Information</SubHeading>

          <Stack spacing='3'>
            {checkout_counters?.length ? (
              checkout_counters.map((counter, index) => (
                <Stack
                  key={counter.id}
                  spacing='2'
                  borderBottom={index < checkout_counters.length - 1 ? '1px' : undefined}
                  borderColor='gray.200'
                  pb={index < checkout_counters.length - 1 ? '3' : undefined}
                  data-testid='checkout-counter-information'
                >
                  <Text fontSize='sm' fontWeight='semibold'>
                    Counter {counter.counter_number ?? index + 1}
                  </Text>
                  <DetailsItem
                    label='Description'
                    value={counter.description || 'N/A'}
                  />
                  <DetailsItem
                    label='Location'
                    value={
                      locations.find(item => item.id === counter.checkout_location?.id)
                        ?.town_name || 'N/A'
                    }
                  />
                  <DetailsItem label='Alias' value={counter.alias_value || 'Pending'} />
                  {counter.qr_code_link && (
                    <CustomButton
                      alignSelf='start'
                      colorVariant='info'
                      onClick={() => {
                        if (counter.qr_code_link) openQrCode(counter.qr_code_link)
                      }}
                    >
                      View QR Code
                    </CustomButton>
                  )}
                  {!counter.qr_code_link && canManageCheckoutCounters && (
                    <CustomButton
                      alignSelf='start'
                      colorVariant='accent-outline'
                      isDisabled={retryCounter.isPending}
                      isLoading={
                        retryCounter.isPending &&
                        retryCounter.variables?.counterId === counter.id
                      }
                      onClick={() =>
                        retryCounter.mutate({
                          merchantId: merchantDetails.id,
                          counterId: counter.id,
                        })
                      }
                    >
                      Retry Registration
                    </CustomButton>
                  )}
                </Stack>
              ))
            ) : (
              <DetailsItem label='Counters' value='N/A' />
            )}

            {canAddCounter && !isAddingCounter && (
              <CustomButton
                alignSelf='start'
                colorVariant='accent-outline'
                onClick={() => setIsAddingCounter(true)}
              >
                Add Checkout Counter
              </CustomButton>
            )}

            {canAddCounter && isAddingCounter && (
              <Stack
                as='form'
                spacing='3'
                borderTop='1px'
                borderColor='gray.200'
                pt='3'
                onSubmit={event => {
                  event.preventDefault()
                  void submitCounter()
                }}
              >
                <FormControl isRequired>
                  <FormLabel fontSize='sm'>Merchant Location</FormLabel>
                  <Select
                    value={counterLocationId}
                    onChange={event => setCounterLocationId(event.target.value)}
                  >
                    {locations.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.town_name || item.country || 'Location'} (#{item.id})
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel fontSize='sm'>Counter Description</FormLabel>
                  <Input
                    value={counterDescription}
                    maxLength={255}
                    placeholder='e.g. Express checkout'
                    onChange={event => setCounterDescription(event.target.value)}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize='sm'>Custom Payinto Alias</FormLabel>
                  <Input
                    value={counterAlias}
                    maxLength={32}
                    pattern='[A-Za-z0-9_-]+'
                    placeholder='Optional'
                    onChange={event => setCounterAlias(event.target.value)}
                  />
                  <FormHelperText>
                    Leave blank to generate the next alias from the primary Payinto ID.
                  </FormHelperText>
                </FormControl>

                <HStack>
                  <CustomButton
                    type='submit'
                    isLoading={addCounter.isPending}
                    isDisabled={
                      addCounter.isPending ||
                      counterDescription.trim().length === 0 ||
                      counterLocationId.length === 0
                    }
                  >
                    Add and Generate QR
                  </CustomButton>
                  <CustomButton
                    colorVariant='accent-outline'
                    isDisabled={addCounter.isPending}
                    onClick={() => setIsAddingCounter(false)}
                  >
                    Cancel
                  </CustomButton>
                </HStack>
              </Stack>
            )}

            {selectedQrCodeUrl && (
              <QRCodeModal
                isOpen={isOpen}
                onClose={closeQrCode}
                qrCodeUrl={selectedQrCodeUrl}
              />
            )}
          </Stack>
        </GridItemShell>
      </Grid>
    </>
  )
}

const MerchantInformationModal = ({
  isOpen,
  onClose,
  selectedMerchantId,
}: MerchantInformationModalProps) => {
  const merchant = useMerchant(selectedMerchantId)
  const userProfile = useUserProfile()
  const canManageCheckoutCounters =
    userProfile.data?.role.permissions.includes('Edit Merchants') ?? false

  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior='inside'>
      <ModalOverlay bg='hsl(0, 0%, 100%, 0.6)' backdropFilter='blur(4px)' />

      <ModalContent w='90vw' maxW='1000px' mt='14' mb={{ base: '14', lg: '0' }}>
        <ModalHeader py='3' borderBottom='1px' borderColor='gray.100'>
          <Heading as='h3' size='md'>
            Merchant Information
          </Heading>
        </ModalHeader>
        <ModalCloseButton top='2.5' right='4' />

        <ModalBody py='5' px={{ base: '4', md: '6' }}>
          {merchant.isLoading && (
            <HStack data-testid='skeleton-loading'>
              <Skeleton w='50%' h='500px' rounded='md' />
              <Skeleton w='50%' h='500px' rounded='md' />
            </HStack>
          )}

          {merchant.isSuccess && (
            <MerchantInfo
              merchantDetails={merchant.data}
              canManageCheckoutCounters={canManageCheckoutCounters}
            />
          )}
        </ModalBody>

        <ModalFooter>
          <CustomButton colorVariant='info' mr='3' onClick={onClose}>
            Close
          </CustomButton>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default MerchantInformationModal
