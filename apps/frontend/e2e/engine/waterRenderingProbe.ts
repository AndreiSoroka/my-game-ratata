import { Actor, Color, vec } from 'excalibur'

import { SceneMapView } from '../../src/game/runtime/sceneMapActor'
import { loadRenderedTiledMap, type RenderedTiledMap } from '../../src/game/runtime/tiledMap'
import { mountEngine, pixel, startEngine, type TestEngine } from './engineSupport'

interface Point {
    x: number
    y: number
}

interface Basin {
    map: string
    camera: Point
    shore: Point
    insideCorner: Point
    center: Point
    land: Point
}

const pond: Basin = {
    map: 'map-1-1.json',
    camera: { x: 1140, y: 151 },
    shore: { x: 1126, y: 152 },
    insideCorner: { x: 1141, y: 144 },
    center: { x: 1160, y: 152 },
    land: { x: 1118, y: 152 },
}
const lake: Basin = {
    map: 'map-0-1.json',
    camera: { x: 1043, y: 119 },
    shore: { x: 1030, y: 120 },
    insideCorner: { x: 1045, y: 112 },
    center: { x: 1064, y: 120 },
    land: { x: 1021, y: 120 },
}

const frameMs = 200
const cycleMs = 6 * frameMs

export async function verifyWaterRendering() {
    const { run, view } = createProbe()
    try {
        const [pondMap, lakeMap, city] = await Promise.all([
            loadMap(pond.map),
            loadMap(lake.map),
            loadMap('map-2-2.json'),
        ])
        await startEngine(run)
        const small = await checkBasin(run, view, pondMap, pond)
        const large = await checkBasin(run, view, lakeMap, lake)
        const fractional = await compareFractionalFrame(run, view, lakeMap)
        const oldActor = mapActor(run)
        if (!oldActor) throw new Error('The animated lake actor is missing')
        view.setMap(city)
        const dryFirst = await readFrame(run)
        const dryLater = await readFrame(run, cycleMs + frameMs)

        return {
            ...run.contextStatus(),
            pond: small,
            lake: large,
            fractional,
            dry: {
                oldActorRemoved: !run.engine.currentScene.actors.includes(oldActor),
                hasWaterOverlay: Boolean(mapActor(run)?.graphics.onPostDraw),
                differentPixels: countChangedPixels(dryFirst, dryLater),
            },
        }
    } finally {
        await run.owner.cancel()
    }
}

async function checkBasin(
    run: TestEngine,
    view: SceneMapView,
    map: RenderedTiledMap,
    basin: Basin
) {
    aimCamera(run, basin.camera)
    await setAnimatedMap(run, view, map)
    const first = await readFrame(run)
    const next = await readFrame(run, frameMs)
    const repeated = await readFrame(run, cycleMs - frameMs)

    const marker = new Actor({
        x: basin.shore.x + 0.5,
        y: basin.shore.y + 0.5,
        width: 3,
        height: 3,
        z: 0,
        color: Color.fromHex('#ff00ff'),
    })
    run.engine.add(marker)
    const foreground = worldPixel(run, await readFrame(run, frameMs), basin.shore)
    marker.kill()

    return {
        shore: worldPixel(run, [first, next], basin.shore),
        insideCorner: worldPixel(run, [first, next], basin.insideCorner),
        center: worldPixel(run, [first, next], basin.center),
        land: worldPixel(run, [first, next], basin.land),
        loopDifferentPixels: countChangedPixels(first, repeated),
        foreground,
    }
}

async function compareFractionalFrame(run: TestEngine, view: SceneMapView, map: RenderedTiledMap) {
    aimCamera(run, { x: lake.camera.x + 0.17, y: lake.camera.y + 0.41 })
    const baked = await bakeSecondFrame(map)
    view.setMap({ ...map, bitmap: baked, animatedWater: undefined })
    const expected = await readFrame(run)
    await setAnimatedMap(run, view, map)
    const base = await readFrame(run)
    const actual = await readFrame(run, frameMs)
    return {
        ...measureShorelineMotion(base, expected, actual),
        shore: worldPixel(run, [base, actual], lake.shore),
    }
}

function measureShorelineMotion(base: ImageData, expected: ImageData, actual: ImageData) {
    const { width, height } = expected
    const shoreline = new Uint8Array(width * height)
    const strongMotion = 24
    let expectedStrongPixels = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x
            const delta = rgbDelta(base, expected, index)
            if (delta === 0) continue
            if (delta >= strongMotion) expectedStrongPixels++
            // Pixel and blended sampling can round the edge to adjacent screen pixels.
            for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
                shoreline.fill(
                    1,
                    row * width + Math.max(0, x - 1),
                    row * width + Math.min(width, x + 2)
                )
            }
        }
    }
    let outsideShoreline = 0
    let animatedStrongPixels = 0
    for (let index = 0; index < shoreline.length; index++) {
        const delta = rgbDelta(base, actual, index)
        if (delta !== 0 && !shoreline[index]) outsideShoreline++
        if (delta >= strongMotion && rgbDelta(base, expected, index) >= strongMotion)
            animatedStrongPixels++
    }
    return {
        outsideShoreline,
        animatedStrongPixels,
        expectedStrongPixels,
    }
}

function rgbDelta(first: ImageData, second: ImageData, index: number): number {
    const offset = index * 4
    return Math.max(
        Math.abs(first.data[offset]! - second.data[offset]!),
        Math.abs(first.data[offset + 1]! - second.data[offset + 1]!),
        Math.abs(first.data[offset + 2]! - second.data[offset + 2]!)
    )
}

async function bakeSecondFrame(map: RenderedTiledMap): Promise<HTMLCanvasElement> {
    const animation = map.animatedWater
    const url = animation?.frameUrls[0]
    if (!animation || !url) throw new Error('Expected a water atlas on the lake map')
    const atlas = new Image()
    atlas.src = url
    await atlas.decode()
    const bitmap = document.createElement('canvas')
    bitmap.width = map.worldWidth
    bitmap.height = map.worldHeight
    const ctx = bitmap.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D is required for the baked reference')
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(map.bitmap, 0, 0)
    for (const q of animation.quarters) {
        ctx.drawImage(atlas, q.sourceX, q.sourceY, 8, 8, q.x, q.y, q.width, q.height)
    }
    return bitmap
}

export async function verifyWaterFallback() {
    const { run, view } = createProbe()
    try {
        const [wet, dry] = await Promise.all([loadMap(pond.map), loadMap('map-2-2.json')])
        await startEngine(run)
        aimCamera(run, pond.camera)
        const results = await observeWaterLoad(() => view.setMap(wet))
        const first = await readFrame(run)
        const later = await readFrame(run, frameMs)
        const hadOverlay = Boolean(mapActor(run)?.graphics.onPostDraw)

        view.setMap(dry)
        run.clock.step(1)
        await setAnimatedMap(run, view, wet)
        const retryFirst = await readFrame(run)
        const retryAnimated = await readFrame(run, frameMs)
        return {
            failedFrames: results.filter((loaded) => !loaded).length,
            staticDifferentPixels: countChangedPixels(first, later),
            hadOverlay,
            retriedShore: worldPixel(run, [retryFirst, retryAnimated], pond.shore),
        }
    } finally {
        await run.owner.cancel()
    }
}

export async function verifyReducedWaterMotion() {
    const { run, view } = createProbe()
    try {
        const map = await loadMap(pond.map)
        await startEngine(run)
        aimCamera(run, pond.camera)
        await setAnimatedMap(run, view, map)
        const first = await readFrame(run)
        const later = await readFrame(run, frameMs)
        return { differentPixels: countChangedPixels(first, later) }
    } finally {
        await run.owner.cancel()
    }
}

function createProbe() {
    const run = mountEngine()
    const view = new SceneMapView(run.engine)
    run.owner.addCleanup(() => view.dispose())
    return { run, view }
}

function loadMap(name: string) {
    return loadRenderedTiledMap('/game/map', name)
}

function observeWaterLoad(apply: () => void): Promise<boolean[]> {
    const proto = HTMLImageElement.prototype
    const source = Object.getOwnPropertyDescriptor(proto, 'src')
    if (!source?.set) throw new Error('HTMLImageElement.src does not expose a setter')
    const promises: Promise<boolean>[] = []
    const set = source.set
    Object.defineProperty(proto, 'src', {
        ...source,
        set(this: HTMLImageElement, value: string) {
            if (/\/water[2-6]\.png(?:\?|$)/.test(value)) {
                promises.push(
                    new Promise((resolve) => {
                        this.addEventListener('load', () => resolve(true), { once: true })
                        this.addEventListener('error', () => resolve(false), { once: true })
                    })
                )
            }
            set.call(this, value)
        },
    })
    try {
        apply()
        if (promises.length !== 5) throw new Error('Expected five optional shoreline atlases')
        return Promise.all(promises)
    } finally {
        Object.defineProperty(proto, 'src', source)
    }
}

function mapActor(run: TestEngine): Actor | undefined {
    return run.engine.currentScene.actors.find((actor) => actor.z === -100)
}

function aimCamera({ engine }: TestEngine, point: Point): void {
    engine.currentScene.camera.pos = vec(point.x, point.y)
    engine.currentScene.camera.zoom = 3
}

async function setAnimatedMap(run: TestEngine, view: SceneMapView, map: RenderedTiledMap) {
    view.setMap(map)
    run.clock.step(1)
    // Wait for decode without advancing the actor's TestClock past frame zero.
    const deadline = performance.now() + 10_000
    while (!mapActor(run)?.graphics.onPostDraw) {
        if (performance.now() >= deadline) throw new Error('Shoreline atlas did not become ready')
        await new Promise(requestAnimationFrame)
    }
}

async function readFrame(run: TestEngine, elapsed = 1): Promise<ImageData> {
    const pending = run.engine.screenshot()
    run.clock.step(elapsed)
    const source = await pending
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not read WebGL screenshot')
    ctx.drawImage(source, 0, 0)
    return ctx.getImageData(0, 0, source.width, source.height)
}

function worldPixel(run: TestEngine, image: ImageData, point: Point): number[]
function worldPixel(run: TestEngine, image: ImageData[], point: Point): number[][]
function worldPixel(run: TestEngine, image: ImageData | ImageData[], point: Point) {
    const screen = run.engine.worldToScreenCoordinates(vec(point.x + 0.5, point.y + 0.5))
    const x = Math.floor(screen.x)
    const y = Math.floor(screen.y)
    if (Array.isArray(image)) return image.map((frame) => pixel(frame, x, y))
    return pixel(image, x, y)
}

function countChangedPixels(first: ImageData, second: ImageData): number {
    let changed = 0
    for (let i = 0; i < first.data.length; i += 4) {
        if (
            first.data.subarray(i, i + 4).some((value, index) => value !== second.data[i + index])
        ) {
            changed++
        }
    }
    return changed
}
