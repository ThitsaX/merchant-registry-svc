import { useEffect } from 'react'
import {
  Box,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Stack,
  Text,
  useToast,
} from '@chakra-ui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import {
  MERCHANT_ALIAS_MAX_LENGTH,
  MerchantLocationType,
} from 'shared-lib'

import { locationInfoSchema, type LocationInfoForm } from '@/lib/validations/registry'
import {
  useCountries,
  useCreateLocationInfo,
  useDistricts,
  useDraft,
  useSubdivisions,
  useUpdateLocationInfo,
} from '@/api/hooks/forms'
import { useMerchantId } from '@/hooks'
import { CustomButton, FloatingSpinner } from '@/components/ui'
import { AddressFormFields, FormInput, FormSelect } from '@/components/form'
import GridShell from './GridShell'

const LOCATION_TYPES = Object.entries(MerchantLocationType).map(([, label]) => ({
  value: label,
  label,
}))

interface LocationInfoFormProps {
  setActiveStep: React.Dispatch<React.SetStateAction<number>>
}

const LocationInfoForm = ({ setActiveStep }: LocationInfoFormProps) => {
  const toast = useToast()

  const {
    control,
    register,
    watch,
    formState: { errors },
    setValue,
    setFocus,
    handleSubmit,
  } = useForm<LocationInfoForm>({
    resolver: zodResolver(locationInfoSchema),
    defaultValues: {
      checkout_counters: [{ counter_number: 1, description: '', alias_value: '' }],
    },
  })
  const {
    fields: checkoutCounters,
    append: appendCheckoutCounter,
    remove: removeCheckoutCounter,
    replace: replaceCheckoutCounters,
  } = useFieldArray({
    control,
    name: 'checkout_counters',
    keyName: 'fieldKey',
  })

  const watchedCountry = watch('country') || ''
  const watchedSubdivision = watch('country_subdivision') || ''

  const merchantId = useMerchantId()
  const countries = useCountries()
  const subdivisions = useSubdivisions(watchedCountry)
  const districts = useDistricts(watchedCountry, watchedSubdivision)

  const countryOptions = countries.data?.map(country => ({
    value: country,
    label: country,
  }))
  const subdivisionOptions = subdivisions.data?.map(subdivision => ({
    value: subdivision,
    label: subdivision,
  }))
  const districtOptions = districts.data?.map(district => ({
    value: district,
    label: district,
  }))

  const goToNextStep = () => setActiveStep(activeStep => activeStep + 1)

  const draft = useDraft(Number(merchantId))
  const draftData = draft.data

  const createLocationInfo = useCreateLocationInfo(goToNextStep)
  const updateLocationInfo = useUpdateLocationInfo(goToNextStep)

  useEffect(() => {
    if (!draftData) return

    if (!draftData.locations?.[0]) return

    const {
      location_type,
      web_url,
      department,
      sub_department,
      street_name,
      building_number,
      building_name,
      floor_number,
      room_number,
      post_box,
      postal_code,
      country,
      town_name,
      district_name,
      country_subdivision,
      longitude,
      latitude,
    } = draftData.locations[0]

    location_type && setValue('location_type', location_type)
    web_url && setValue('web_url', web_url)
    department && setValue('department', department)
    sub_department && setValue('sub_department', sub_department)
    street_name && setValue('street_name', street_name)
    building_number && setValue('building_number', building_number)
    building_name && setValue('building_name', building_name)
    floor_number && setValue('floor_number', floor_number)
    room_number && setValue('room_number', room_number)
    post_box && setValue('post_box', post_box)
    postal_code && setValue('postal_code', postal_code)
    country && setValue('country', country)
    town_name && setValue('town_name', town_name)
    district_name && setValue('district_name', district_name)
    country_subdivision && setValue('country_subdivision', country_subdivision)
    longitude && setValue('longitude', longitude)
    latitude && setValue('latitude', latitude)
    const locationCounters = draftData.checkout_counters?.filter(counter =>
      counter.checkout_location == null ||
      counter.checkout_location.id === draftData.locations[0].id
    )
    const counters = locationCounters?.length
      ? locationCounters.map((counter, index) => ({
          id: counter.id,
          counter_number: counter.counter_number ?? index + 1,
          description: counter.description || `Checkout counter ${index + 1}`,
          alias_value: counter.alias_value || '',
        }))
      : [{ counter_number: 1, description: '', alias_value: '' }]
    replaceCheckoutCounters(counters)
  }, [draftData, replaceCheckoutCounters, setValue])

  const onSubmit = (values: LocationInfoForm) => {
    if (!merchantId) {
      return toast({
        title: 'Merchant ID not found!',
        status: 'error',
      })
    }

    const existingLocationId = draft.data?.locations?.[0]?.id
    if (existingLocationId) {
      updateLocationInfo.mutate({
        params: values,
        merchantId,
        locationId: existingLocationId,
      })
    } else {
      createLocationInfo.mutate({ params: values, merchantId })
    }
  }

  // focus on first input that has error after validation
  useEffect(() => {
    const firstError = Object.keys(errors)[0] as keyof LocationInfoForm

    if (firstError) {
      setFocus(
        firstError === 'checkout_counters'
          ? 'checkout_counters.0.description'
          : firstError
      )
    }
  }, [errors, setFocus])

  return (
    <>
      {(draft.isFetching ||
        countries.isLoading ||
        subdivisions.isFetching ||
        districts.isFetching) && <FloatingSpinner />}

      <Stack
        as='form'
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        data-testid='location-info-form'
      >
        <GridShell justifyItems='center'>
          <FormSelect
            isRequired
            name='location_type'
            register={register}
            errors={errors}
            label='Location Type'
            placeholder='Location Type'
            options={LOCATION_TYPES}
          />

          <FormInput
            name='web_url'
            register={register}
            errors={errors}
            label='Website URL'
            placeholder='Website URL'
          />
        </GridShell>

        <AddressFormFields
          register={register}
          errors={errors}
          setValue={setValue}
          countryOptions={countryOptions}
          subdivisionOptions={subdivisionOptions}
          districtOptions={districtOptions}
          headingText='Physical Business Address'
          requireQrLocationFields
        />

        <Stack spacing='4' pb={{ base: '8', sm: '12' }}>
          <HStack justify='space-between'>
            <Text fontWeight='semibold'>Checkout Counters</Text>
            <CustomButton
              colorVariant='accent-outline'
              onClick={() => {
                const nextCounterNumber = Math.max(
                  0,
                  ...checkoutCounters.map((item, itemIndex) =>
                    item.counter_number ?? itemIndex + 1
                  )
                ) + 1
                appendCheckoutCounter({
                  counter_number: nextCounterNumber,
                  description: '',
                  alias_value: '',
                })
              }}
              isDisabled={checkoutCounters.length >= 50}
            >
              Add counter
            </CustomButton>
          </HStack>

          {checkoutCounters.map((counter, index) => {
            const counterErrors = errors.checkout_counters?.[index]
            const descriptionId = `checkout-counter-${index}-description`
            const aliasId = `checkout-counter-${index}-alias`
            return (
              <Stack
                key={counter.fieldKey}
                spacing='3'
                border='1px'
                borderColor='gray.200'
                rounded='md'
                p='4'
                data-testid='checkout-counter-fields'
              >
                <HStack justify='space-between'>
                  <Text fontSize='sm' fontWeight='semibold'>
                    Counter {counter.counter_number ?? index + 1}
                  </Text>
                  {checkoutCounters.length > 1 &&
                    (counter.counter_number ?? index + 1) !== 1 && (
                    <CustomButton
                      colorVariant='danger'
                      onClick={() => removeCheckoutCounter(index)}
                      aria-label={`Remove checkout counter ${
                        counter.counter_number ?? index + 1
                      }`}
                    >
                      Remove
                    </CustomButton>
                    )}
                </HStack>

                {typeof counter.id === 'number' && (
                  <input
                    type='hidden'
                    {...register(`checkout_counters.${index}.id`, {
                      valueAsNumber: true,
                    })}
                  />
                )}

                <GridShell justifyItems='center'>
                  <FormControl isRequired isInvalid={!!counterErrors?.description}>
                    <FormLabel htmlFor={descriptionId} fontSize='sm'>
                      Checkout Counter Description
                    </FormLabel>
                    <Input
                      id={descriptionId}
                      {...register(`checkout_counters.${index}.description`)}
                      placeholder='Example: Main till'
                    />
                    <FormErrorMessage>
                      {counterErrors?.description?.message}
                    </FormErrorMessage>
                  </FormControl>

                  <FormControl isInvalid={!!counterErrors?.alias_value}>
                    <FormLabel htmlFor={aliasId} fontSize='sm'>
                      Custom Counter Alias (Optional)
                    </FormLabel>
                    <Input
                      id={aliasId}
                      {...register(`checkout_counters.${index}.alias_value`)}
                      placeholder='Generated automatically when blank'
                      maxLength={MERCHANT_ALIAS_MAX_LENGTH}
                    />
                    <FormErrorMessage>
                      {counterErrors?.alias_value?.message}
                    </FormErrorMessage>
                  </FormControl>
                </GridShell>
              </Stack>
            )
          })}
        </Stack>

        <Box alignSelf='end'>
          <CustomButton
            colorVariant='accent-outline'
            w='32'
            mr='4'
            onClick={() => setActiveStep(activeStep => activeStep - 1)}
          >
            Back
          </CustomButton>

          <CustomButton
            type='submit'
            isLoading={createLocationInfo.isPending || updateLocationInfo.isPending}
          >
            Save and Proceed
          </CustomButton>
        </Box>
      </Stack>
    </>
  )
}

export default LocationInfoForm
