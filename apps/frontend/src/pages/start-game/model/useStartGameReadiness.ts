import type { GameReadiness } from '@my-game-ratata/contracts'
import { ref, watch } from 'vue'

import { getGameReadiness } from '../api/startGameApi'

export type StartGameStatus = GameReadiness['state'] | 'connection_error'
const refreshIntervalMs = 2_000

export function useStartGameReadiness(enabled: () => boolean) {
    const status = ref<StartGameStatus>('checking')
    let pending: Promise<void> | undefined
    watch(
        enabled,
        (active, _previous, cleanup) => {
            if (!active) return
            const controller = new AbortController()
            const { signal } = controller
            let nextCheck: number | undefined
            status.value = 'checking'
            function poll(): void {
                pending = getGameReadiness(signal)
                    .then((state) => {
                        if (!signal.aborted) status.value = state
                    })
                    .catch(() => {
                        if (!signal.aborted) status.value = 'connection_error'
                    })
                    .finally(() => {
                        if (signal.aborted) return
                        pending = undefined
                        nextCheck = window.setTimeout(poll, refreshIntervalMs)
                    })
            }
            cleanup(() => {
                controller.abort()
                window.clearTimeout(nextCheck)
                pending = undefined
            })
            poll()
        },
        { immediate: true }
    )
    async function canEnter(): Promise<boolean> {
        if (status.value === 'checking') await pending
        return status.value === 'ready'
    }
    return { status, canEnter }
}
