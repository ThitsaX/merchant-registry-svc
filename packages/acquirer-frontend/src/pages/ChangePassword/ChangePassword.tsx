import { Box, Heading, Stack, Text } from '@chakra-ui/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'

import { useChangePassword } from '@/api/hooks/auth'
import { FormInput } from '@/components/form'
import { CustomButton } from '@/components/ui'
import {
  changePasswordSchema,
  type ChangePasswordForm,
} from '@/lib/validations/changePassword'
import { isTokenExpired } from '@/utils'

const ChangePassword = () => {
  const token = localStorage.getItem('token')
  const changePassword = useChangePassword()
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  })

  if (!token || isTokenExpired(token)) {
    localStorage.removeItem('token')
    localStorage.removeItem('mustChangePassword')
    return <Navigate to='/login' replace />
  }

  const onSubmit = (values: ChangePasswordForm) => {
    changePassword.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    })
  }

  return (
    <Box minH='100vh' bg='primaryBackground' py='16' px='4'>
      <Stack
        as='form'
        onSubmit={handleSubmit(onSubmit)}
        spacing='5'
        maxW='28rem'
        mx='auto'
        bg='white'
        rounded='xl'
        shadow='md'
        p={{ base: '6', md: '10' }}
      >
        <Heading size='lg'>Change your password</Heading>
        <Text color='gray.600'>
          Your temporary password can only be used to sign in. Choose a new password
          to continue.
        </Text>

        <FormInput
          name='currentPassword'
          register={register}
          errors={errors}
          label='Temporary password'
          inputProps={{ type: 'password', autoComplete: 'current-password' }}
          maxW='full'
        />
        <FormInput
          name='newPassword'
          register={register}
          errors={errors}
          label='New password'
          inputProps={{ type: 'password', autoComplete: 'new-password' }}
          maxW='full'
        />
        <FormInput
          name='confirmPassword'
          register={register}
          errors={errors}
          label='Confirm new password'
          inputProps={{ type: 'password', autoComplete: 'new-password' }}
          maxW='full'
        />

        <CustomButton
          type='submit'
          size='md'
          isLoading={changePassword.isPending}
        >
          Change password
        </CustomButton>
      </Stack>
    </Box>
  )
}

export default ChangePassword
