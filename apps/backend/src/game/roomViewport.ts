import type { SetViewportClientMessage } from '@my-game-ratata/contracts'

import type { RoomSocket } from './roomMessaging'

interface SocketViewport {
    playerId: string
    hint: SetViewportClientMessage
}

const viewports = new WeakMap<RoomSocket, SocketViewport>()

export function setSocketViewport(
    socket: RoomSocket,
    playerId: string,
    locationId: string,
    hint: SetViewportClientMessage
): boolean {
    if (hint.locationId !== locationId) {
        return false
    }
    viewports.set(socket, { playerId, hint })
    return true
}

export function socketViewport(
    socket: RoomSocket,
    playerId: string | undefined,
    locationId: string | undefined
): SetViewportClientMessage | undefined {
    const viewport = viewports.get(socket)
    if (
        viewport !== undefined &&
        viewport.playerId === playerId &&
        viewport.hint.locationId === locationId
    ) {
        return viewport.hint
    }
    viewports.delete(socket)
    return undefined
}

export function clearSocketViewport(socket: RoomSocket): void {
    viewports.delete(socket)
}
