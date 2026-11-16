import { Actor, Canvas, type Engine, vec } from 'excalibur'

import { mapCameraBounds } from './mapCamera'
import type { RenderedTiledMap } from './tiledMap'

interface BackdropStrip {
    x: number
    y: number
    width: number
    height: number
}

/** Cached world-space strips keep the void still and never draw stars over the map itself. */
export class MapBackdrop {
    private actors: Actor[] = []

    public constructor(private readonly engine: Engine) {}

    public setMap(map: RenderedTiledMap): void {
        this.dispose()
        const bounds = mapCameraBounds(map)
        const width = bounds.right - bounds.left
        const strips: BackdropStrip[] = [
            { x: bounds.left, y: bounds.top, width, height: -bounds.top },
            { x: bounds.left, y: map.worldHeight, width, height: -bounds.top },
            { x: bounds.left, y: 0, width: -bounds.left, height: map.worldHeight },
            { x: map.worldWidth, y: 0, width: -bounds.left, height: map.worldHeight },
        ]
        for (const strip of strips) {
            const actor = new Actor({
                anchor: vec(0, 0),
                pos: vec(strip.x, strip.y),
                width: strip.width,
                height: strip.height,
                z: -101,
            })
            actor.graphics.use(
                new Canvas({
                    width: strip.width,
                    height: strip.height,
                    cache: true,
                    smoothing: false,
                    draw: (context) => drawStars(context, strip),
                })
            )
            this.engine.add(actor)
            this.actors.push(actor)
        }
    }

    public dispose(): void {
        for (const actor of this.actors) actor.kill()
        this.actors = []
    }
}

function drawStars(context: CanvasRenderingContext2D, strip: BackdropStrip): void {
    context.fillStyle = '#000000'
    context.fillRect(0, 0, strip.width, strip.height)
    const cellSize = 32
    for (let y = 0; y < strip.height; y += cellSize) {
        for (let x = 0; x < strip.width; x += cellSize) {
            const seed = starSeed(strip.x + x, strip.y + y)
            if (seed % 3 !== 0) continue
            const starX = x + 3 + ((seed >>> 4) % 26)
            const starY = y + 3 + ((seed >>> 12) % 26)
            if (starX >= strip.width || starY >= strip.height) continue
            context.fillStyle = seed % 5 === 0 ? '#81908e' : '#384746'
            context.fillRect(starX, starY, 1, 1)
        }
    }
}

function starSeed(x: number, y: number): number {
    const seed = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35)
    return (seed ^ (seed >>> 16)) >>> 0
}
