import type {
    AdventureResourceNode,
    ClientMessage,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { PointerButton, type PointerEvent, PointerType } from 'excalibur'

import { focusWorldInput, worldPointerBlocked } from '../ui/keyboardOwnership'
import { characterAt } from './runtimeCharacterTargets'
import type { RuntimeChatInput } from './runtimeChatInput'
interface PointerContext {
    snapshot: WorldSnapshot | undefined
    playerId: string | undefined
    visible: (id: string) => boolean
    resourceVisible?: (node: AdventureResourceNode) => boolean
    plant: (point: Vector2) => boolean
    select: (id: string) => void
    send: (command: ClientMessage) => void
}

/** The first world click leaves typing without also selecting or acting in the world. */
export function consumeRuntimePointerFocus(event: PointerEvent, chat: RuntimeChatInput): boolean {
    if (worldPointerBlocked(chat.isActive)) return true
    if (event.button !== PointerButton.Left && event.pointerType !== PointerType.Touch)
        return chat.isActive
    if (chat.isActive) {
        chat.suspend()
        return true
    }
    focusWorldInput()
    return false
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
        if (!(context.resourceVisible?.(node) ?? false)) return false
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
    context.send({ type: 'move_to', target, ...(append ? { append: true } : {}) })
}

function harvestable(node: AdventureResourceNode): boolean {
    return (
        !['growing', 'removed', 'depleted'].includes(node.phase ?? 'ready') &&
        (node.remaining > 0 || node.phase === 'stump')
    )
}
