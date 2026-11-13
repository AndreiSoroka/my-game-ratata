import type {
    CharacterMovementSnapshot,
    ClientMessage,
    MovementMode,
} from '@my-game-ratata/contracts'

export class RuntimeMovementControls {
    private sneaking = false

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

    public observe(movement: CharacterMovementSnapshot | undefined, disrupted = false): void {
        if (movement?.dashing || disrupted) this.sneaking = false
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
