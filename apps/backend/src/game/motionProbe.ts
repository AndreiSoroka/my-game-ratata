import type { ParseResult } from './messages'
import { type RoomSocket, send } from './roomMessaging'

const minReplyIntervalMs = 500
const lastReplyTimes = new WeakMap<RoomSocket, number>()

export function parseMotionPing(id: unknown): ParseResult {
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
        ? { message: { type: 'motion_ping', id } }
        : { error: 'Invalid motion probe id' }
}

export function replyToMotionPing(
    socket: RoomSocket,
    id: number,
    serverReceivedAt: number,
    wallTime: number
): void {
    const transport: Partial<RoomSocket> = socket
    const lastReplyAt = lastReplyTimes.get(socket) ?? -Infinity
    if (
        wallTime - lastReplyAt < minReplyIntervalMs ||
        (transport.getBufferedAmount?.() ?? 0) > 0
    ) {
        return
    }
    lastReplyTimes.set(socket, wallTime)
    send(socket, { type: 'motion_pong', id, serverReceivedAt })
}
