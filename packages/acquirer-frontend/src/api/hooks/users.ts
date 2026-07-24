import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@chakra-ui/react'
import { isAxiosError } from 'axios'

import { FALLBACK_ERROR_MESSAGE } from '@/constants/errorMessage'
import {
  createUser,
  getUserProfile,
  getUsers,
  resetUserTemporaryPassword,
  updateUserStatus,
} from '../users'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    meta: {
      toastStatus: 'error',
      toastTitle: 'Fetching Users Failed!',
      toastDescription: FALLBACK_ERROR_MESSAGE,
    },
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: createUser,
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      const emailDescription =
        data.emailDelivery.status === 'sent'
          ? 'The user was notified by email.'
          : 'Share the temporary password through a secure channel.'
      toast({
        title: 'User Creation Successful!',
        description: emailDescription,
        status: 'success',
      })
    },
    onError: error => {
      let errorMessage = FALLBACK_ERROR_MESSAGE
      if (isAxiosError(error) && typeof error.response?.data.message === 'string') {
        errorMessage = error.response.data.message
      }
      toast({
        title: 'User Creation Failed!',
        description: errorMessage,
        status: 'error',
      })
    },
  })
}

export function useResetUserTemporaryPassword() {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: resetUserTemporaryPassword,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'Temporary Password Generated',
        description: 'Copy it now and share it through a secure channel.',
        status: 'success',
      })
    },
    onError: error => {
      let errorMessage = FALLBACK_ERROR_MESSAGE
      if (isAxiosError(error) && typeof error.response?.data.message === 'string') {
        errorMessage = error.response.data.message
      }
      toast({
        title: 'Password Reset Failed!',
        description: errorMessage,
        status: 'error',
      })
    },
  })
}

export function useUserStatusUpdate() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (data: { userId: string | number; newStatus: string }) =>
      updateUserStatus(data.userId, data.newStatus),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'User Status Update Successful!',
        description: 'User status has been updated successfully.',
        status: 'success',
      })
    },
    onError: error => {
      let errorMessage = FALLBACK_ERROR_MESSAGE
      if (isAxiosError(error) && typeof error.response?.data.message === 'string') {
        errorMessage = error.response.data.message
      }
      toast({
        title: 'User Status Update Failed!',
        description: errorMessage,
        status: 'error',
      })
    },
  })

  return mutation
}

export function useUserProfile() {
  return useQuery({
    queryKey: ['users', 'profile'],
    queryFn: getUserProfile,
    meta: {
      toastStatus: 'error',
      toastTitle: 'Fetching User Profile Failed!',
      toastDescription: FALLBACK_ERROR_MESSAGE,
    },
  })
}
