import { useState, useEffect, useCallback } from 'react'
import { type Room, type CreateInput, type UpdateInput } from '../types'
import {
  subscribeToRooms,
  addRoom as fbAdd,
  updateRoom as fbUpdate,
  deleteRoom as fbDelete,
} from '../firebase/rooms'

interface UseRoomsReturn {
  rooms: Room[]
  loading: boolean
  error: Error | null
  clearError: () => void
  addRoom: (input: CreateInput<Room>) => Promise<void>
  updateRoom: (id: string, input: UpdateInput<Room>) => Promise<void>
  deleteRoom: (id: string) => Promise<void>
}

export function useRooms(): UseRoomsReturn {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToRooms(
      (data) => {
        setRooms(data)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const addRoom = useCallback(async (input: CreateInput<Room>) => {
    setError(null)
    try {
      await fbAdd(input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const updateRoom = useCallback(async (id: string, input: UpdateInput<Room>) => {
    setError(null)
    try {
      await fbUpdate(id, input)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  const deleteRoom = useCallback(async (id: string) => {
    setError(null)
    try {
      await fbDelete(id)
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      setError(e)
      throw e
    }
  }, [])

  return {
    rooms,
    loading,
    error,
    clearError,
    addRoom,
    updateRoom,
    deleteRoom,
  }
}
