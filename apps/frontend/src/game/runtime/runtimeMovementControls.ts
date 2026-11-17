import type {
    CharacterMovementSnapshot,
    ClientMessage,
    MovementMode,
} from '@my-game-ratata/contracts'

import { axisFromKeys } from './input'

export class RuntimeMovementControls {
    private sneaking = false
    private disrupted = false

    public constructor(private readonly send: (command: ClientMessage) => void) {}

    public keyDown(event: KeyboardEvent): boolean {
        if (event.code === 'KeyC') {
            if (!event.repeat) {
                this.sneaking = !this.sneaking
                this.updateMode()
            }
        } else if (event.code === 'Space') {
            if (!event.repeat) this.send({ type: 'dash' })
        } else return false
        event.preventDefault()
        return true
    }

    public observe(movement: CharacterMovementSnapshot | undefined, disrupted = false): boolean {
        const started = disrupted && !this.disrupted
        this.disrupted = disrupted
        if (movement?.dashing || disrupted) this.sneaking = false
        return started
    }

    public acceptMode(mode: MovementMode): void {
        this.sneaking = mode === 'sneaking'
    }

    public release(): void {
        this.updateMode()
    }

    private updateMode(): void {
        this.send({ type: 'movement_mode', mode: this.sneaking ? 'sneaking' : 'walking' })
    }
}

export function flushRuntimeMoveInput(
    keys: Set<string>,
    previous: import('@my-game-ratata/contracts').Vector2,
    send: (message: ClientMessage) => void
): import('@my-game-ratata/contracts').Vector2 {
    const axis = axisFromKeys(keys)
    if (axis.x !== previous.x || axis.y !== previous.y) send({ axis, type: 'move_input' })
    return axis
}
