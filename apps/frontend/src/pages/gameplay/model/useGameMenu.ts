import { nextTick, ref } from 'vue'

import type { RatataGame } from '../../../game/runtime/ratataGame'
import { isPublicChatEditor, isWorldHudButton } from '../../../game/ui/keyboardOwnership'
import { useEscapeOwner } from './uiEscapeOwners'

export function useGameMenu(options: {
    available: () => boolean
    game: () => RatataGame | undefined
    chatting: () => boolean
    leave: () => void
}) {
    const open = ref(false)
    let previousFocus: HTMLElement | undefined
    function show(): void {
        if (!options.available()) return
        const wasOpen = open.value
        if (!wasOpen && document.activeElement instanceof HTMLElement)
            previousFocus = document.activeElement
        const game = options.game()
        game?.cancelChat()
        game?.releaseUiControls()
        open.value = true
        if (!wasOpen) game?.playUiSound('uiOpen')
    }
    function dismiss(): boolean {
        const wasOpen = open.value
        open.value = false
        void nextTick(() => restoreFocus(previousFocus))
        return wasOpen
    }
    function resume(): void {
        if (dismiss()) options.game()?.playUiSound('uiClose')
    }
    useEscapeOwner({
        active: () => options.chatting(),
        escape: () => options.game()?.cancelChat(),
        ownsFocus: isPublicChatEditor,
        priority: 150,
    })
    useEscapeOwner({
        active: () => options.available() && !open.value,
        escape: show,
        priority: -100,
    })
    return {
        open,
        show,
        dismiss,
        resume,
        leave: () => {
            open.value = false
            options.leave()
        },
    }
}

function restoreFocus(previous: HTMLElement | undefined): void {
    const death = document.querySelector<HTMLElement>('[role="alertdialog"] [tabindex="-1"]')
    const valid =
        previous?.isConnected &&
        !isWorldHudButton(previous) &&
        !previous.closest('[inert], [hidden], :disabled')
    const target = death ?? (valid ? previous : undefined)
    ;(target ?? document.querySelector<HTMLCanvasElement>('[data-game-canvas]'))?.focus()
}
