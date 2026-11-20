import { apiGet } from './api'

export interface EmptyRoom {
  name: string
  size: number
  status: number[]
}

export interface EmptyRoomBuilding {
  code: string
  rooms: EmptyRoom[]
}

export interface EmptyRoomDay {
  date: string
  dates: string[]
  fetchedAt: string
  campus: string
  buildings: EmptyRoomBuilding[]
  matched: boolean
}

export function fetchEmptyRooms(date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  return apiGet<EmptyRoomDay>(`/api/empty-rooms${query}`)
}
