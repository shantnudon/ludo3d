import { RoomDurableObject, type Env } from './room-object'

export { RoomDurableObject }
export type { Env }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/ws') {
      const code = (url.searchParams.get('code') ?? '').toUpperCase()
      if (!/^[A-Z0-9]{4}$/.test(code)) {
        return new Response('invalid room code', { status: 400 })
      }
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected a websocket upgrade', { status: 426 })
      }
      const id = env.ROOMS.idFromName(code)
      return env.ROOMS.get(id).fetch(request)
    }

    if (url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    return env.ASSETS.fetch(request)
  },
}
