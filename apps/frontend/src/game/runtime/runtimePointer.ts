import type {
    AdventureResourceNode,
    ClientMessage,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { PointerButton, type PointerEvent } from 'excalibur'

import { worldPointerBlocked } from '../ui/keyboardOwnership'
import { characterAt } from './runtimeCharacterTargets'
interface PointerContext {
    snapshot: WorldSnapshot | undefined
    playerId: string | undefined
    visible: (id: string) => boolean
    resourceVisible?: (point: Vector2, bounds?: WorldObjectBounds) => boolean
    plant: (point: Vector2) => boolean
    select: (id: string) => void
    send: (command: ClientMessage) => void
}
export function handleRuntimePointer(event: PointerEvent, context: PointerContext): void {
    if (event.button === PointerButton.Right || worldPointerBlocked()) return
    const target = { x: event.worldPos.x, y: event.worldPos.y }
    if (context.plant(target)) return
    const id = characterAt(context.snapshot, context.playerId, target, context.visible)
    if (id) {
        context.select(id)
        return
    }
    const resource = context.snapshot?.adventure?.resourceNodes.find((node) => {
        if (!harvestable(node)) return false
        if (!(context.resourceVisible?.(node.position, node.bounds) ?? false)) return false
        const bounds = node.bounds ?? {
            x: node.position.x - 8,
            y: node.position.y - 8,
            width: 16,
            height: 16,
        }
        return (
            target.x >= bounds.x &&
            target.x <= bounds.x + bounds.width &&
            target.y >= bounds.y &&
            target.y <= bounds.y + bounds.height
        )
    })
    if (resource) {
        context.send({
            type: 'auto_action',
            action: {
                kind: 'gather',
                nodeId: resource.id,
                operation: resource.phase === 'stump' ? 'clear_stump' : 'harvest',
            },
        })
        return
    }
    const append = event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey
    if (!append) context.send({ type: 'cancel_control' })
    context.send({ type: 'move_to', target, ...(append ? { append: true } : {}) })
}

function harvestable(node: AdventureResourceNode): boolean {
    return (
        !['growing', 'removed', 'depleted'].includes(node.phase ?? 'ready') &&
        (node.remaining > 0 || node.phase === 'stump')
    )
}
