import { nextTick, ref } from 'vue'

import type { RatataGame } from '../runtime/ratataGame'
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
        if (!open.value && document.activeElement instanceof HTMLElement)
            previousFocus = document.activeElement
        options.game()?.cancelChat()
        options.game()?.releaseUiControls()
        open.value = true
    }
    function resume(): void {
        open.value = false
        void nextTick(() => restoreFocus(previousFocus))
    }
    useEscapeOwner({
        active: () => options.chatting(),
        escape: () => options.game()?.cancelChat(),
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
        resume,
        leave: () => {
            open.value = false
            options.leave()
        },
    }
}

function restoreFocus(previous: HTMLElement | undefined): void {
    const death = document.querySelector<HTMLElement>('[role="alertdialog"] [tabindex="-1"]')
    const valid = previous?.isConnected && !previous.closest('[inert], [hidden], :disabled')
    const target = death ?? (valid ? previous : undefined)
    ;(target ?? document.querySelector<HTMLCanvasElement>('[data-game-canvas]'))?.focus()
}
