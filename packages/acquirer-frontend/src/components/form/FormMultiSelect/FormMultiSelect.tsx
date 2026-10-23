import { ChevronDownIcon } from '@chakra-ui/icons'
import {
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  type FormControlProps,
} from '@chakra-ui/react'
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

interface FormMultiSelectProps<T extends FieldValues> extends FormControlProps {
  name: Path<T>
  control: Control<T>
  errors: FieldErrors<T>
  label: string
  placeholder: string
  options: Option[]
  helperText?: string
}

const FormMultiSelect = <T extends FieldValues>({
  name,
  control,
  errors,
  label,
  placeholder,
  options,
  helperText,
  ...props
}: FormMultiSelectProps<T>) => {
  const fieldError = errors[name]

  return (
    <FormControl id={name} isInvalid={!!fieldError} maxW={{ md: '20rem' }} {...props}>
      <FormLabel fontSize='sm'>{label}</FormLabel>
      <Controller
        name={name}
        control={control}
        render={({ field }) => {
          const selectedValues: string[] = Array.isArray(field.value)
            ? field.value.map(String)
            : []
          const selectedLabels = selectedValues
            .map(value => options.find(option => option.value === value)?.label)
            .filter((optionLabel): optionLabel is string => optionLabel !== undefined)

          return (
            <Menu closeOnSelect={false} matchWidth>
              <MenuButton
                as={Button}
                id={name}
                aria-label={label}
                rightIcon={<ChevronDownIcon />}
                variant='outline'
                width='full'
                textAlign='left'
                fontWeight='normal'
                color={selectedLabels.length > 0 ? 'inherit' : 'gray.500'}
                onBlur={field.onBlur}
              >
                {selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
              </MenuButton>
              <MenuList maxHeight='16rem' overflowY='auto'>
                <MenuOptionGroup
                  type='checkbox'
                  value={selectedValues}
                  onChange={value =>
                    field.onChange(Array.isArray(value) ? value : [value])
                  }
                >
                  {options.map(option => (
                    <MenuItemOption key={option.value} value={option.value}>
                      {option.label}
                    </MenuItemOption>
                  ))}
                </MenuOptionGroup>
              </MenuList>
            </Menu>
          )
        }}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
      <FormErrorMessage>{fieldError?.message?.toString() || ''}</FormErrorMessage>
    </FormControl>
  )
}

export default FormMultiSelect
