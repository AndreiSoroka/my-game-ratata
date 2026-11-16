import type { RatataTestState, TestCommand } from './testInterface'

/** Replace an ordinary click path as well as releasing held/automatic controls. */
export function stopAgentMovement(
    state: RatataTestState,
    send: (command: TestCommand) => void,
    replacePath = true
): void {
    if (!state.connected) return
    send({ type: 'cancel_control' })
    if (state.player?.alive && !state.player.tags.includes('offline')) {
        // Repeat the selected gait even before a just-sent dash reaches the snapshot.
        send({ type: 'movement_mode', mode: state.player.movement?.mode ?? 'walking' })
        // Zero input does not clear a click path. A normal click at our latest observed
        // position replaces it; the server still resolves pathfinding and collision.
        if (replacePath) send({ type: 'move_to', target: { ...state.player.position } })
    }
    send({ type: 'move_input', axis: { x: 0, y: 0 } })
}
