import type { Vector2 } from '@my-game-ratata/contracts'
import type { Engine } from 'excalibur'

import { InteractionTargetViews } from './interactionTargetViews'
export class PlantingPreview {
    private view: InteractionTargetViews | undefined
    private pointer: ((point: Vector2) => void) | undefined
    public initialize(engine: Engine): void {
        this.view = new InteractionTargetViews(engine)
    }
    public set(handler: ((point: Vector2) => void) | undefined): void {
        this.pointer = handler
        if (!handler) this.view?.clear()
    }
    public preview(position: Vector2): void {
        this.view?.set({
            key: 'planting',
            position,
            bounds: { x: position.x - 8, y: position.y - 8, width: 16, height: 16 },
        })
    }
    public pick(position: Vector2): boolean {
        if (!this.pointer) return false
        this.pointer(position)
        return true
    }
    public dispose(): void {
        this.pointer = undefined
        this.view?.dispose()
    }
}
