import type { PlantTreePreview, Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, type PointerEvent, vec } from 'excalibur'

/** A server-approved future trunk footprint, independent from world target selection. */
export class PlantingPreview {
    private view: Actor | undefined
    private pointer: ((point: Vector2) => void) | undefined
    private hover: ((point: Vector2) => void) | undefined
    private shape = ''
    private readonly listeners = new Set<(preview: PlantTreePreview) => void>()
    public constructor(private readonly release?: () => void) {}
    public receive(preview: PlantTreePreview): void {
        for (const listener of this.listeners) listener(preview)
    }
    public subscribe(listener: (preview: PlantTreePreview) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }
    private readonly move = (event: PointerEvent): void => {
        if (
            typeof globalThis.PointerEvent !== 'undefined' &&
            event.nativeEvent instanceof globalThis.PointerEvent &&
            event.nativeEvent.pointerType === 'touch'
        )
            return
        this.hover?.({ x: event.worldPos.x, y: event.worldPos.y })
    }
    public initialize(engine: Engine): () => void {
        const view = new Actor({ anchor: vec(0, 0), z: 1 })
        this.view = view
        view.graphics.isVisible = false
        engine.add(view)
        engine.input.pointers.primary.on('move', this.move)
        return () => {
            engine.input.pointers.primary.off('move', this.move)
            view.kill()
            if (this.view === view) {
                this.set()
                this.view = undefined
                this.shape = ''
            }
        }
    }
    public set(handler?: (point: Vector2) => void, hover?: (point: Vector2) => void): void {
        if (handler) this.release?.()
        this.pointer = handler
        this.hover = hover
        if (!handler && this.view) this.view.graphics.isVisible = false
    }
    public preview(position: Vector2, available = false, footprint?: WorldObjectBounds): void {
        if (!this.view) return
        const bounds = footprint ?? {
            x: position.x - 24,
            y: position.y - 24,
            width: 48,
            height: 32,
        }
        const key = `${bounds.width}:${bounds.height}:${available}`
        if (key !== this.shape) {
            const color = available ? '#f5d659' : '#a3a5a8'
            this.view.graphics.use(
                new Canvas({
                    width: bounds.width + 2,
                    height: bounds.height + 2,
                    cache: true,
                    draw: (context) => {
                        context.fillStyle = `${color}66`
                        context.fillRect(1, 1, bounds.width, bounds.height)
                        context.strokeStyle = color
                        context.lineWidth = 2
                        context.strokeRect(1, 1, bounds.width, bounds.height)
                    },
                })
            )
            this.shape = key
        }
        this.view.pos = vec(bounds.x - 1, bounds.y - 1)
        this.view.graphics.isVisible = true
    }
    public pick(position: Vector2): boolean {
        if (!this.pointer) return false
        this.pointer(position)
        return true
    }
    public dispose(): void {
        this.set()
        this.listeners.clear()
    }
}
