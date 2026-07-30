import { useDeferredValue, useRef, useState } from 'react'
import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  useOutsideClick,
  type FormControlProps,
  type InputProps,
} from '@chakra-ui/react'
import { ChevronDownIcon } from '@chakra-ui/icons'
import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
} from 'react-hook-form'

interface Option {
  value: string
  label: string
}

interface FormDatalistProps<T extends FieldValues> extends FormControlProps {
  name: Path<T>
  control: Control<T>
  errors: FieldErrors<T>
  label: string
  placeholder?: string
  helperText?: string
  options: Option[]
  inputProps?: InputProps
}

const FormDatalist = <T extends FieldValues>({
  name,
  control,
  errors,
  label,
  placeholder,
  helperText,
  options,
  inputProps,
  ...props
}: FormDatalistProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const visibleOptions = options
    .filter(({ value, label }) => {
      if (!deferredQuery) return true

      return (
        value.toLowerCase().includes(deferredQuery) ||
        label.toLowerCase().includes(deferredQuery)
      )
    })
    .slice(0, 50)

  useOutsideClick({
    ref: containerRef,
    handler: () => setIsOpen(false),
  })

  return (
    <FormControl isInvalid={!!errors[name]} maxW={{ md: '20rem' }} {...props}>
      <FormLabel fontSize='sm'>{label}</FormLabel>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <Box ref={containerRef} position='relative'>
            <InputGroup>
              <Input
                {...inputProps}
                name={field.name}
                ref={field.ref}
                value={String(field.value ?? '')}
                onBlur={field.onBlur}
                onChange={event => {
                  field.onChange(event.target.value)
                  setQuery(event.target.value)
                  setIsOpen(true)
                }}
                onFocus={event => {
                  setQuery(event.currentTarget.value)
                  setIsOpen(true)
                }}
                autoComplete='off'
                placeholder={placeholder}
                type='text'
              />
              <InputRightElement>
                <Button
                  aria-label={`Toggle ${label} options`}
                  minW='auto'
                  px='2'
                  type='button'
                  variant='ghost'
                  onClick={() => {
                    setQuery('')
                    setIsOpen(open => !open)
                  }}
                >
                  <ChevronDownIcon boxSize='5' />
                </Button>
              </InputRightElement>
            </InputGroup>

            {isOpen && (
              <Box
                role='listbox'
                position='absolute'
                zIndex='dropdown'
                mt='1'
                w='100%'
                maxH='16rem'
                overflowY='auto'
                borderWidth='1px'
                borderRadius='md'
                bg='white'
                boxShadow='lg'
              >
                {visibleOptions.length > 0 ? (
                  visibleOptions.map(({ value, label }) => (
                    <Button
                      key={value}
                      role='option'
                      aria-selected={String(field.value ?? '') === value}
                      display='block'
                      w='100%'
                      h='auto'
                      px='3'
                      py='2'
                      textAlign='left'
                      whiteSpace='normal'
                      borderRadius='none'
                      type='button'
                      variant='ghost'
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => {
                        field.onChange(value)
                        setQuery(value)
                        setIsOpen(false)
                      }}
                    >
                      <Text as='span' fontWeight='semibold'>
                        {value}
                      </Text>
                      <Text as='span' ml='2' color='gray.600' fontWeight='normal'>
                        {label}
                      </Text>
                    </Button>
                  ))
                ) : (
                  <Text px='3' py='2' color='gray.600' fontSize='sm'>
                    No matching option found.
                  </Text>
                )}
              </Box>
            )}
          </Box>
        )}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
      <FormErrorMessage>{errors[name]?.message?.toString() || ''}</FormErrorMessage>
    </FormControl>
  )
}

export default FormDatalist
