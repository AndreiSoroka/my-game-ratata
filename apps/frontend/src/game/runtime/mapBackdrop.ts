import { Actor, Canvas, Color, type Engine, type ExcaliburGraphicsContext, vec } from 'excalibur'

import { mapCameraBounds } from './mapCamera'
import type { RenderedTiledMap } from './tiledMap'

interface BackdropStrip {
    x: number
    y: number
    width: number
    height: number
}

interface BackdropStar {
    x: number
    y: number
    color: Color
}

const cameraCompensation = [0.12, 0.18, 0.24, 0.3, 0.36]
const maximumCompensation = cameraCompensation.at(-1)!
const starCellSize = 32
const brightStar = Color.fromHex('#81908e')
const dimStar = Color.fromHex('#384746')

/** Keep the black strips fixed in world space while the stars move inside them. */
export class MapBackdrop {
    private actors: Actor[] = []

    public constructor(private readonly engine: Engine) {}

    public setMap(map: RenderedTiledMap): void {
        this.dispose()
        const bounds = mapCameraBounds(map)
        const width = bounds.right - bounds.left
        const centerX = map.worldWidth / 2
        const centerY = map.worldHeight / 2
        const paddingX = Math.ceil((width / 2) * maximumCompensation) + 1
        const paddingY = Math.ceil(((bounds.bottom - bounds.top) / 2) * maximumCompensation) + 1
        const strips: BackdropStrip[] = [
            { x: bounds.left, y: bounds.top, width, height: -bounds.top },
            { x: bounds.left, y: map.worldHeight, width, height: -bounds.top },
            { x: bounds.left, y: 0, width: -bounds.left, height: map.worldHeight },
            { x: map.worldWidth, y: 0, width: -bounds.left, height: map.worldHeight },
        ]
        for (const strip of strips) {
            const stars = generateStars(strip, paddingX, paddingY)
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
                    draw: (context) => {
                        context.fillStyle = '#000000'
                        context.fillRect(0, 0, strip.width, strip.height)
                    },
                })
            )
            actor.graphics.onPostDraw = (context) => {
                const { x, y } = this.engine.currentScene.camera.drawPos
                drawStars(context, strip, stars, x - centerX, y - centerY)
            }
            this.engine.add(actor)
            this.actors.push(actor)
        }
    }

    public dispose(): void {
        for (const actor of this.actors) actor.kill()
        this.actors = []
    }
}

function generateStars(strip: BackdropStrip, paddingX: number, paddingY: number): BackdropStar[][] {
    // Use the same lattice on both sides of a strip seam so a drifting pixel can cross it.
    const startX = Math.floor((strip.x - paddingX) / starCellSize) * starCellSize
    const startY = Math.floor((strip.y - paddingY) / starCellSize) * starCellSize
    const endX = strip.x + strip.width + paddingX
    const endY = strip.y + strip.height + paddingY
    const layers = cameraCompensation.map(() => [] as BackdropStar[])
    for (let y = startY; y < endY; y += starCellSize) {
        for (let x = startX; x < endX; x += starCellSize) {
            const seed = starSeed(x, y)
            if (seed % 3 !== 0) continue
            const layer = (seed >>> 24) % layers.length
            layers[layer]!.push({
                x: x + 3 + ((seed >>> 4) % 26) - strip.x,
                y: y + 3 + ((seed >>> 12) % 26) - strip.y,
                color: seed % 5 === 0 ? brightStar : dimStar,
            })
        }
    }
    return layers
}

function drawStars(
    context: ExcaliburGraphicsContext,
    strip: BackdropStrip,
    layers: BackdropStar[][],
    cameraX: number,
    cameraY: number
): void {
    for (const [index, stars] of layers.entries()) {
        // Excalibur already subtracts the full camera motion from the strip.
        const offsetX = cameraX * cameraCompensation[index]!
        const offsetY = cameraY * cameraCompensation[index]!
        for (const star of stars) {
            const x = star.x + offsetX
            const y = star.y + offsetY
            const left = Math.max(0, x)
            const top = Math.max(0, y)
            const width = Math.min(strip.width, x + 1) - left
            const height = Math.min(strip.height, y + 1) - top
            if (width > 0 && height > 0)
                context.drawRectangle(vec(left, top), width, height, star.color)
        }
    }
}

function starSeed(x: number, y: number): number {
    const seed = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y, 0xc2b2ae35)
    return (seed ^ (seed >>> 16)) >>> 0
}
