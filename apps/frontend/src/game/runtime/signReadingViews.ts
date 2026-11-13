import type { CharacterSnapshot, Vector2, WorldObjectSnapshot } from '@my-game-ratata/contracts'
import { Actor, Canvas, type Engine, vec } from 'excalibur'

import type { MapVisibility } from './mapVisibility'
import { nearestReadableSign } from './signReading'

/** One nearby reading hint, never a permanent map label or an automatic dialogue. */
export class SignReadingViews {
    private readonly label: Actor
    private displayedText = ''
    private map: MapVisibility | undefined

    public constructor(engine: Engine) {
        this.label = new Actor({ z: 10_000 })
        this.label.graphics.anchor = vec(0.5, 1)
        this.clear()
        engine.add(this.label)
    }

    public setMap(map: MapVisibility): void {
        this.map = map
        this.clear()
    }

    public update(
        objects: WorldObjectSnapshot[],
        player: CharacterSnapshot | undefined,
        isPositionVisible: (position: Vector2) => boolean
    ): void {
        const sign = nearestReadableSign(objects, player, this.map, isPositionVisible)
        if (!sign) {
            this.clear()
            return
        }
        if (this.displayedText !== sign.name) {
            this.label.graphics.use(readingGraphic(sign.name))
            this.displayedText = sign.name
        }
        this.label.pos = vec(sign.position.x, sign.bounds.y - 4)
        this.label.graphics.isVisible = true
    }

    public dispose(): void {
        this.clear()
        this.map = undefined
        this.label.kill()
    }

    private clear(): void {
        this.displayedText = ''
        this.label.graphics.isVisible = false
    }
}

/** Cache the raster once per name, with fill drawn after the contrasting background. */
function readingGraphic(text: string): Canvas {
    const width = 128
    const height = 14
    return new Canvas({
        width,
        height,
        cache: true,
        smoothing: false,
        draw: (context) => {
            context.font = '500 8px system-ui, sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            const textWidth = Math.min(width - 10, Math.ceil(context.measureText(text).width))
            context.fillStyle = '#172318'
            context.fillRect((width - textWidth - 10) / 2, 0, textWidth + 10, height)
            context.fillStyle = '#fff0c5'
            context.fillText(text, width / 2, height / 2, width - 10)
        },
    })
}
