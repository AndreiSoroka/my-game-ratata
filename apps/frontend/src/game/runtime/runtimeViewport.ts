import type { ClientMessage, ViewportBounds } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'

const gridSize = 32
const updateIntervalMs = 100

/** Reports the camera's view as an interest hint; the server owns visibility and reach. */
export class RuntimeViewport {
    private engine: Engine | undefined
    private previous: { locationId: string; bounds: ViewportBounds } | undefined
    private nextUpdateAt = 0

    public constructor(
        private readonly send: (message: ClientMessage) => void,
        private readonly location: () => string | undefined,
        private readonly clock = () => performance.now()
    ) {}

    public start(engine: Engine): void {
        this.stop()
        this.engine = engine
        engine.on('postupdate', this.update)
    }

    /** Send the current view on the first frame after the map and camera are ready. */
    public reset(): void {
        this.previous = undefined
        this.nextUpdateAt = 0
    }

    public stop(): void {
        this.engine?.off('postupdate', this.update)
        this.engine = undefined
        this.reset()
    }

    private readonly update = (): void => {
        const engine = this.engine
        const locationId = this.location()
        if (!engine || locationId === undefined) return
        const now = this.clock()
        if (this.previous?.locationId === locationId && now < this.nextUpdateAt) return
        const bounds = quantizeBounds(engine.screen.getWorldBounds())
        if (
            !bounds ||
            (this.previous?.locationId === locationId && equalBounds(this.previous.bounds, bounds))
        )
            return
        this.send({ type: 'set_viewport', locationId, bounds })
        this.previous = { locationId, bounds }
        this.nextUpdateAt = now + updateIntervalMs
    }
}

function quantizeBounds(bounds: ViewportBounds): ViewportBounds | undefined {
    if (
        ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite) ||
        bounds.right <= bounds.left ||
        bounds.bottom <= bounds.top
    )
        return undefined
    return {
        left: Math.floor(bounds.left / gridSize) * gridSize,
        top: Math.floor(bounds.top / gridSize) * gridSize,
        right: Math.ceil(bounds.right / gridSize) * gridSize,
        bottom: Math.ceil(bounds.bottom / gridSize) * gridSize,
    }
}

function equalBounds(first: ViewportBounds, second: ViewportBounds): boolean {
    return (
        first.left === second.left &&
        first.top === second.top &&
        first.right === second.right &&
        first.bottom === second.bottom
    )
}
