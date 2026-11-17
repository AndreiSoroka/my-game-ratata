import type { ClientMessage } from '@my-game-ratata/contracts'

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
    playUi: () => void
    stopMovement: () => void
}

export function handleRuntimeKeyDown(event: KeyboardEvent, actions: RuntimeKeyContext): void {
    if (isGameKeyboardBlocked(event)) return
    if (
        actions.chat.handleKey(event, (text) => {
            const targetId = actions.options.getChatTargetId?.()
            const focusKey = actions.options.getChatFocusKey?.()
            actions.send({
                text,
                type: 'chat',
                ...(targetId ? { targetId } : {}),
                ...(focusKey ? { focusKey } : {}),
            })
        })
    )
        return
    if (actions.movement.keyDown(event)) return
    if (
        handleRuntimeShortcut(event, {
            pickup: () => actions.send({ type: 'pickup_item' }),
            inventory: () => {
                actions.options.onInventoryToggle()
                actions.playUi()
            },
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
    if (movementKeys.has(event.code)) {
        actions.send({ type: 'cancel_control' })
        actions.move(event.code)
    }
}
