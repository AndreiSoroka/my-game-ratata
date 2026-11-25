import {
    type Actor,
    type Camera,
    type Engine,
    type ExcaliburGraphicsContext,
    ImageFiltering,
    ImageSourceAttributeConstants,
} from 'excalibur'

import { type AnimatedWater, waterAtlasHeight, waterAtlasWidth } from './mapWaterAnimation'
import type { TerrainRegion } from './terrainAutotile'
import { loadImage } from './tiledMapAssets'

const frameMs = 200

/** Loads the optional shoreline frames once and draws them on the current map actor. */
export class SceneWaterAnimation {
    private readonly atlases = new Map<string, Promise<readonly HTMLCanvasElement[] | undefined>>()
    private readonly reducedMotion =
        typeof matchMedia === 'function'
            ? matchMedia('(prefers-reduced-motion: reduce)')
            : undefined
    private detach: (() => void) | undefined

    public constructor(private readonly engine: Pick<Engine, 'currentScene'>) {}

    public setMap(actor: Actor, water?: AnimatedWater): void {
        this.detach?.()
        this.detach = undefined
        if (!water) return

        let retired = false
        let stop: (() => void) | undefined
        this.detach = () => {
            retired = true
            stop?.()
        }
        void this.loadFrames(water).then((frames) => {
            if (!retired && frames) stop = this.animate(actor, water.regions, frames)
        })
    }

    public dispose(): void {
        this.detach?.()
        this.detach = undefined
        this.atlases.clear()
    }

    private loadFrames(water: AnimatedWater): Promise<readonly HTMLCanvasElement[] | undefined> {
        const key = JSON.stringify(water.frameUrls)
        const cached = this.atlases.get(key)
        if (cached) return cached

        const pending = loadWaterFrames(water).catch(() => {
            if (this.atlases.get(key) === pending) this.atlases.delete(key)
            return undefined
        })
        this.atlases.set(key, pending)
        return pending
    }

    private animate(
        actor: Actor,
        regions: readonly TerrainRegion[],
        frames: readonly HTMLCanvasElement[]
    ): () => void {
        let elapsedMs: number | undefined
        const cycleMs = (frames.length + 1) * frameMs
        const update = actor.on('postupdate', ({ elapsed }) => {
            elapsedMs =
                elapsedMs === undefined || this.reducedMotion?.matches
                    ? 0
                    : (elapsedMs + elapsed) % cycleMs
        })
        actor.graphics.onPostDraw = (context) => {
            // Frame zero is already in the static map graphic.
            const frame = frames[Math.floor((elapsedMs ?? 0) / frameMs) - 1]
            if (frame && !this.reducedMotion?.matches) {
                drawWaterFrame(context, frame, regions, this.engine.currentScene.camera)
            }
        }
        return () => {
            update.close()
            actor.graphics.onPostDraw = null
        }
    }
}

async function loadWaterFrames(water: AnimatedWater): Promise<HTMLCanvasElement[]> {
    const frames = await Promise.all(water.frameUrls.map(loadImage))
    const baseline = rasterWaterAtlas(water.baseAtlas).pixels.data
    return frames.map((image) => {
        const { canvas, context, pixels } = rasterWaterAtlas(image)
        keepChangedWaterPixels(pixels.data, baseline)
        context.putImageData(pixels, 0, 0)
        canvas.setAttribute(ImageSourceAttributeConstants.Filtering, ImageFiltering.Pixel)
        return canvas
    })
}

function rasterWaterAtlas(image: HTMLImageElement) {
    if (image.naturalWidth !== waterAtlasWidth || image.naturalHeight !== waterAtlasHeight) {
        throw new Error('Invalid water frame size')
    }
    const canvas = document.createElement('canvas')
    canvas.width = waterAtlasWidth
    canvas.height = waterAtlasHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Cannot prepare water frame')
    context.drawImage(image, 0, 0)
    return {
        canvas,
        context,
        pixels: context.getImageData(0, 0, waterAtlasWidth, waterAtlasHeight),
    }
}

function keepChangedWaterPixels(frame: Uint8ClampedArray, baseline: Uint8ClampedArray): void {
    for (let i = 0; i < frame.length; i += 4) {
        const alpha = frame[i + 3]
        if (alpha !== baseline[i + 3] || (alpha !== 0 && alpha !== 255)) {
            throw new Error('Water frames must use the same opaque shoreline')
        }
        // Preserve the baked land and bank samples at fractional camera positions.
        if (
            frame[i] === baseline[i] &&
            frame[i + 1] === baseline[i + 1] &&
            frame[i + 2] === baseline[i + 2]
        ) {
            frame[i + 3] = 0
        }
    }
}

function drawWaterFrame(
    context: ExcaliburGraphicsContext,
    frame: HTMLCanvasElement,
    regions: readonly TerrainRegion[],
    camera: Camera
): void {
    // The map actor draws at the world origin. Account for the camera's snapped draw position.
    const { viewport, drawPos } = camera
    const dx = drawPos.x - camera.x
    const dy = drawPos.y - camera.y
    const left = viewport.left + dx
    const right = viewport.right + dx
    const top = viewport.top + dy
    const bottom = viewport.bottom + dy
    for (const { sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height } of regions) {
        if (x >= right || x + width <= left || y >= bottom || y + height <= top) continue
        context.drawImage(frame, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
    }
}
