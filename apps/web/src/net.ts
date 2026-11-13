import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@ludo/core'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: GameSocket | null = null

export function serverUrl(): string {
  const explicit = import.meta.env.VITE_SERVER_URL as string | undefined
  if (explicit) return explicit
  if (import.meta.env.DEV) {
    // Works for localhost and for a phone on the same WiFi.
    return `http://${window.location.hostname}:3001`
  }
  return window.location.origin
}

export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(serverUrl(), {
      autoConnect: true,
      transports: ['websocket'],
    }) as GameSocket
  }
  return socket
}
