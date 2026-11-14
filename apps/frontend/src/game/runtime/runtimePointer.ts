import type { ClientMessage, Vector2, WorldSnapshot } from '@my-game-ratata/contracts'
import { PointerButton, type PointerEvent } from 'excalibur'

import { characterAt } from './runtimeCharacterTargets'
interface PointerContext {
    snapshot: WorldSnapshot | undefined
    playerId: string | undefined
    visible: (id: string) => boolean
    plant: (point: Vector2) => boolean
    select: (id: string) => void
    send: (command: ClientMessage) => void
}
export function handleRuntimePointer(event: PointerEvent, context: PointerContext): void {
    if (event.button === PointerButton.Right) return
    const target = { x: event.worldPos.x, y: event.worldPos.y }
    if (context.plant(target)) return
    const id = characterAt(context.snapshot, context.playerId, target, context.visible)
    if (id) {
        context.select(id)
        return
    }
    context.send({ type: 'cancel_control' })
    context.send({ type: 'move_to', target })
}
