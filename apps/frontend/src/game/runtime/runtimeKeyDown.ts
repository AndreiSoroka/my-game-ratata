import type { ClientMessage } from '@my-game-ratata/contracts'

import { publicChatOwnsKey } from '../ui/keyboardOwnership'
import { movementKeys } from './input'
import type { RuntimeChatInput } from './runtimeChatInput'
import { isGameKeyboardBlocked } from './runtimeKeyboardFocus'
import type { RuntimeMovementControls } from './runtimeMovementControls'
import type { RatataGameOptions } from './runtimeOptions'
import { handleRuntimeShortcut } from './runtimeShortcuts'

interface RuntimeKeyContext {
    chat: RuntimeChatInput
    movement: RuntimeMovementControls
    send: (command: ClientMessage) => void
    move: (code: string) => void
    options: RatataGameOptions
    stopMovement: () => void
}

export function handleRuntimeKeyDown(event: KeyboardEvent, actions: RuntimeKeyContext): void {
    if (actions.chat.isActive) {
        if (publicChatOwnsKey(event)) handleChat(event, actions)
        return
    }
    if (isGameKeyboardBlocked(event)) return
    if (publicChatOwnsKey(event) && handleChat(event, actions)) return
    if (actions.movement.keyDown(event)) return
    if (
        handleRuntimeShortcut(event, {
            pickup: () => actions.send({ type: 'pickup_item' }),
            inventory: actions.options.onInventoryToggle,
            character: actions.options.onCharacterToggle,
            context: actions.options.onContextAction
                ? () => {
                      actions.stopMovement()
                      actions.options.onContextAction?.()
                  }
                : undefined,
        })
    )
        return
    if (movementKeys.has(event.code) && !event.repeat) {
        actions.send({ type: 'cancel_control' })
        actions.move(event.code)
    }
}

function handleChat(event: KeyboardEvent, actions: RuntimeKeyContext): boolean {
    return actions.chat.handleKey(event, (text) => {
        const targetId = actions.options.getChatTargetId?.()
        const focusKey = actions.options.getChatFocusKey?.()
        actions.send({
            text,
            type: 'chat',
            ...(targetId ? { targetId } : {}),
            ...(focusKey ? { focusKey } : {}),
        })
    })
}
