import type { Actor, Engine, ExcaliburGraphicsContext } from 'excalibur'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import type { AnimatedWater } from './mapWaterAnimation'
import { SceneWaterAnimation } from './sceneWaterAnimation'

const { loadImage } = vi.hoisted(() => ({
    loadImage: vi.fn<(url: string) => Promise<HTMLImageElement>>(),
}))
vi.mock('excalibur', () => ({
    ImageFiltering: { Pixel: 'Pixel' },
    ImageSourceAttributeConstants: { Filtering: 'data-filtering' },
}))
vi.mock('./tiledMapAssets', () => ({ loadImage }))

const water: AnimatedWater = {
    baseAtlas: atlas('water1'),
    frameUrls: ['water2', 'water3', 'water4', 'water5', 'water6'],
    quarters: [
        { sourceX: 32, sourceY: 8, x: 0, y: 0, width: 8, height: 8 },
        { sourceX: 24, sourceY: 16, x: 128, y: 32, width: 8, height: 8 },
    ],
}

function atlas(src: string, naturalWidth = 96): HTMLImageElement {
    return { src, naturalWidth, naturalHeight: 64 } as HTMLImageElement
}

const prepared = new Map<string, { canvas: HTMLCanvasElement; data: number[] }>()

function atlasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    let src = ''
    return {
        drawImage(image: HTMLImageElement) {
            src = image.src
        },
        getImageData() {
            const blue = src === 'water1' ? 100 : 160
            const alpha = src === 'invalid-mask' ? 0 : 255
            return { data: new Uint8ClampedArray([12, 20, 30, 255, 30, 40, blue, alpha]) }
        },
        putImageData(pixels: ImageData) {
            prepared.set(src, { canvas, data: [...pixels.data] })
        },
    } as unknown as CanvasRenderingContext2D
}

function fixture() {
    const camera = {
        viewport: { left: 0, top: 0, right: 16, bottom: 16 },
        drawPos: { x: 8, y: 8 },
        x: 8,
        y: 8,
    }
    const animation = new SceneWaterAnimation({ currentScene: { camera } } as unknown as Engine)
    const drawImage = vi.fn<ExcaliburGraphicsContext['drawImage']>()
    const context = { drawImage } as unknown as ExcaliburGraphicsContext
    return { animation, drawImage, camera, context }
}

function mapActor() {
    const graphics: Pick<Actor['graphics'], 'onPostDraw'> = { onPostDraw: null }
    let update: ((event: { elapsed: number }) => void) | undefined
    const close = vi.fn<() => void>(() => {
        update = undefined
    })
    const actor = {
        graphics,
        on: vi.fn<(_type: string, fn: NonNullable<typeof update>) => { close: typeof close }>(
            (_, fn) => {
                update = fn
                return { close }
            }
        ),
    } as unknown as Actor
    return {
        actor,
        graphics,
        close,
        update: (elapsed: number) => update?.({ elapsed }),
        draw: (context: ExcaliburGraphicsContext) => graphics.onPostDraw?.(context, 0),
        ready: () => vi.waitFor(() => expect(graphics.onPostDraw).toBeTypeOf('function')),
    }
}

beforeEach(() => {
    loadImage.mockReset().mockImplementation(async (url) => atlas(url))
    prepared.clear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement
    ) {
        return atlasContext(this)
    })
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

it('waits for the atlases and uses the current camera for the non-static frames', async () => {
    const { animation, drawImage, context, camera } = fixture()
    const map = mapActor()
    animation.setMap(map.actor, water)
    expect(map.graphics.onPostDraw).toBeNull()
    await map.ready()
    expect(loadImage).toHaveBeenCalledTimes(5)
    expect(prepared.get('water2')?.canvas.getAttribute('data-filtering')).toBe('Pixel')
    expect(prepared.get('water2')?.data).toEqual([12, 20, 30, 0, 30, 40, 160, 255])

    map.update(300)
    map.update(199)
    map.draw(context)
    expect(drawImage).not.toHaveBeenCalled()
    map.update(1)
    map.draw(context)
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
        prepared.get('water2')?.canvas,
        32,
        8,
        8,
        8,
        0,
        0,
        8,
        8
    )

    camera.viewport = { left: 128, top: 32, right: 144, bottom: 48 }
    map.update(800)
    map.draw(context)
    expect(drawImage).toHaveBeenLastCalledWith(
        prepared.get('water6')?.canvas,
        24,
        16,
        8,
        8,
        128,
        32,
        8,
        8
    )
    map.update(200)
    map.draw(context)
    expect(drawImage).toHaveBeenCalledTimes(2)
})

it('shares frames across maps and drops stale map callbacks', async () => {
    const { animation, drawImage, context } = fixture()
    const late = Promise.withResolvers<HTMLImageElement>()
    loadImage.mockImplementationOnce(() => late.promise)
    const retired = mapActor()
    const wet = mapActor()
    const dry = mapActor()
    animation.setMap(retired.actor, water)
    animation.setMap(dry.actor)
    animation.setMap(wet.actor, water)
    late.resolve(atlas('water2'))
    await wet.ready()
    expect(retired.graphics.onPostDraw).toBeNull()
    expect(dry.graphics.onPostDraw).toBeNull()
    expect(loadImage).toHaveBeenCalledTimes(5)

    wet.update(0)
    wet.update(200)
    wet.draw(context)
    expect(drawImage).toHaveBeenCalledOnce()
    animation.setMap(dry.actor)
    expect(wet.graphics.onPostDraw).toBeNull()
    expect(wet.close).toHaveBeenCalledOnce()

    animation.setMap(wet.actor, water)
    await wet.ready()
    expect(loadImage).toHaveBeenCalledTimes(5)
    wet.draw(context)
    expect(drawImage).toHaveBeenCalledOnce()
    animation.dispose()
    expect(wet.graphics.onPostDraw).toBeNull()
    expect(wet.close).toHaveBeenCalledTimes(2)
})

it.each([
    ['size', atlas('invalid', 48)],
    ['shoreline mask', atlas('invalid-mask')],
])('keeps an invalid atlas %s static and retries on the next map entry', async (_, invalid) => {
    const { animation } = fixture()
    loadImage.mockResolvedValueOnce(invalid)
    const failed = mapActor()
    animation.setMap(failed.actor, water)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(failed.graphics.onPostDraw).toBeNull()
    expect(loadImage).toHaveBeenCalledTimes(5)

    const retry = mapActor()
    animation.setMap(retry.actor, water)
    await retry.ready()
    expect(loadImage).toHaveBeenCalledTimes(10)
})

it('uses the static frame while reduced motion is requested', async () => {
    const media = { matches: true }
    vi.stubGlobal('matchMedia', () => media)
    const { animation, context, drawImage } = fixture()
    const map = mapActor()
    animation.setMap(map.actor, water)
    await map.ready()
    map.update(0)
    map.update(800)
    map.draw(context)
    expect(drawImage).not.toHaveBeenCalled()

    media.matches = false
    map.update(200)
    map.draw(context)
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
        prepared.get('water2')?.canvas,
        32,
        8,
        8,
        8,
        0,
        0,
        8,
        8
    )
    media.matches = true
    map.draw(context)
    expect(drawImage).toHaveBeenCalledOnce()
})
