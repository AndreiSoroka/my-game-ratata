import type {
    CharacterSnapshot,
    ClientMessage,
    MovementMode,
    StopCorrectionRequest,
    Vector2,
} from '@my-game-ratata/contracts'

import { axisFromKeys, movementKeys } from './input'

interface StopPresentation {
    beginStop: (requestId: number) => StopCorrectionRequest | undefined
    cancelStop: () => void
}

const replacementMovementCommands = new Set<ClientMessage['type']>([
    'move_to',
    'release_input',
    'dash',
    'auto_action',
    'auto_attack',
    'follow',
])

export class RuntimeMovementControls {
    private readonly pressedKeys = new Set<string>()
    private lastAxis: Vector2 = { x: 0, y: 0 }
    private stopRequestId = 0
    private sneaking = false
    private disrupted = false
    private walkingPrayer = false

    public constructor(private readonly send: (command: ClientMessage) => void) {}

    public keyDown(event: KeyboardEvent): boolean {
        if (event.code === 'KeyC') {
            if (!event.repeat && !this.walkingPrayer) {
                this.sneaking = !this.sneaking
                this.updateMode()
            }
        } else if (event.code === 'Space') {
            if (!event.repeat) this.send({ type: 'dash' })
        } else return false
        event.preventDefault()
        return true
    }

    public observe(player: CharacterSnapshot | undefined): boolean {
        const disrupted = player !== undefined && (!player.alive || player.cooldowns.stunMsLeft > 0)
        const started = disrupted && !this.disrupted
        this.disrupted = disrupted
        this.walkingPrayer = player?.abilities?.casting?.walkWhileCasting === true
        if (player?.movement?.dashing || disrupted || this.walkingPrayer) this.sneaking = false
        return started
    }

    public acceptMode(mode: MovementMode): void {
        this.sneaking = mode === 'sneaking' && !this.walkingPrayer
    }

    public move(code: string): void {
        this.pressedKeys.add(code)
        this.flush()
    }

    public keyUp(code: string): void {
        if (movementKeys.has(code)) {
            this.pressedKeys.delete(code)
            this.flush()
        }
    }

    public sendCommand(message: ClientMessage): void {
        if (message.type === 'movement_mode') this.acceptMode(message.mode)
        if (message.type === 'move_input') {
            if (isIdle(message.axis)) this.release()
            this.pressedKeys.clear()
        }
        this.send(message)
    }

    public prepareCommand(message: ClientMessage, presentation?: StopPresentation): ClientMessage {
        if (message.type !== 'move_input') {
            this.replaceMovement(message, presentation)
            return message
        }
        const wasMoving = !isIdle(this.lastAxis)
        this.lastAxis = message.axis
        if (!isIdle(message.axis)) {
            presentation?.cancelStop()
            return message
        }
        if (!wasMoving || message.stopCorrection !== undefined) return message
        const stopCorrection = presentation?.beginStop(++this.stopRequestId)
        return stopCorrection ? { ...message, stopCorrection } : message
    }

    public release(): void {
        this.updateMode()
    }

    private replaceMovement(message: ClientMessage, presentation?: StopPresentation): void {
        if (replacementMovementCommands.has(message.type)) presentation?.cancelStop()
        if (message.type === 'move_to' || message.type === 'release_input') {
            this.pressedKeys.clear()
            this.lastAxis = { x: 0, y: 0 }
        }
    }

    private flush(): void {
        const axis = axisFromKeys(this.pressedKeys)
        if (axis.x !== this.lastAxis.x || axis.y !== this.lastAxis.y)
            this.send({ axis, type: 'move_input' })
    }

    private updateMode(): void {
        this.send({ type: 'movement_mode', mode: this.sneaking ? 'sneaking' : 'walking' })
    }
}

function isIdle(axis: Vector2): boolean {
    return axis.x === 0 && axis.y === 0
}
