import type { ClientMessage } from '@my-game-ratata/contracts'
import { onBeforeUnmount, onMounted, watch } from 'vue'

import { SpeechActivityEmitter } from '@/game/runtime/speechActivityEmitter'

/** Sparse presentation hints: no draft text is sent before the user submits it. */
export function usePrivateTyping(options: {
    partnerId: () => string
    available: () => boolean
    command: (message: ClientMessage) => void
}) {
    let activity: SpeechActivityEmitter | undefined
    function stop(): void {
        activity?.stop()
        activity = undefined
    }
    function input(text: string): void {
        if (!text.trim() || !options.available() || document.hidden) {
            stop()
            return
        }
        activity ??= new SpeechActivityEmitter(options.command, {
            channel: 'whisper',
            targetId: options.partnerId(),
        })
        activity.input(true)
    }
    function visibility(): void {
        if (document.hidden) {
            stop()
        }
    }
    watch(options.partnerId, stop)
    watch(options.available, (available) => {
        if (!available) {
            stop()
        }
    })
    onMounted(() => {
        window.addEventListener('blur', stop)
        document.addEventListener('visibilitychange', visibility)
    })
    onBeforeUnmount(() => {
        stop()
        window.removeEventListener('blur', stop)
        document.removeEventListener('visibilitychange', visibility)
    })
    return { input, stop }
}
