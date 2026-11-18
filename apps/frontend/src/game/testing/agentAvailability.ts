import type { RatataTestState } from './testInterface'

/** Loading presentation assets does not disconnect the authoritative player session. */
export function agentConnected(status: string): boolean {
    return ['Connected', 'Loading map', 'Map loading failed'].includes(status)
}

export function agentAvailable(state: RatataTestState): boolean {
    return Boolean(
        state.connected &&
        !state.defeated &&
        state.player?.alive &&
        !state.player.tags.includes('offline')
    )
}

/** Older injected fixtures have no asynchronous map presentation to await. */
export function agentMapReady(state: RatataTestState): boolean {
    return state.mapReady !== false
}
