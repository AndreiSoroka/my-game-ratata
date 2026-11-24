import { Color, DefaultLoader, type Engine, type TestClock } from 'excalibur'

import { createWebglEngine, EngineRun } from '../../src/game/runtime/engineRun'

const frameMs = 16
const maxClockSteps = 1_000
const clockTimeout = 10_000

export interface TestEngine {
    canvas: HTMLCanvasElement
    clock: TestClock
    engine: Engine
    owner: EngineRun
    contextStatus(): { webgl2: boolean; lost: boolean; lostEvents: number; preserve: boolean }
}

export function mountEngine(): TestEngine {
    const host = document.querySelector('#engines')
    if (host === null) throw new Error('Engine host is missing')
    const canvas = document.createElement('canvas')
    let lostEvents = 0
    canvas.addEventListener('webglcontextlost', () => lostEvents++)
    host.append(canvas)
    const owner = new EngineRun(canvas, () =>
        createWebglEngine({
            width: 160,
            height: 120,
            backgroundColor: Color.Black,
            canvasElement: canvas,
            suppressHiDPIScaling: true,
            suppressPlayButton: true,
            suppressConsoleBootMessage: true,
        })
    )
    const { engine } = owner
    const clock = engine.clock.toTestClock()
    engine.clock = clock
    return {
        canvas,
        clock,
        engine,
        owner,
        contextStatus() {
            const gl = canvas.getContext('webgl2')
            return {
                webgl2: gl instanceof WebGL2RenderingContext,
                lost: gl?.isContextLost() ?? true,
                lostEvents,
                preserve: gl?.getContextAttributes()?.preserveDrawingBuffer ?? false,
            }
        },
    }
}

export function beginStart(run: TestEngine, loader = new DefaultLoader()): Promise<boolean> {
    const started = run.owner.start(loader)
    if (!run.clock.isRunning) throw new Error('Engine.start() did not start its TestClock')
    return started
}

export async function stepUntil<T>(result: Promise<T>, clock: TestClock): Promise<T> {
    let settled = false
    const observed = result.finally(() => {
        settled = true
    })
    // A failing result may settle between frames. Keep it observed until it is returned below.
    void observed.catch(() => undefined)
    const deadline = performance.now() + clockTimeout
    for (let step = 0; !settled; step++) {
        if (step >= maxClockSteps || performance.now() >= deadline) {
            throw new Error(`Engine promise did not settle after ${step} clock steps`)
        }
        if (clock.isRunning) clock.step(frameMs)
        // Resource fetches, WebAudio callbacks and screenshot decoding need browser turns.
        await new Promise((resolve) => window.setTimeout(resolve, 0))
    }
    return observed
}

export async function startEngine(run: TestEngine, loader?: DefaultLoader): Promise<void> {
    const ready = await stepUntil(beginStart(run, loader), run.clock)
    if (!ready || !run.engine.isReady) throw new Error('Engine did not finish starting')
}

export async function capture(run: TestEngine): Promise<ImageData> {
    const image = await stepUntil(run.engine.screenshot(), run.clock)
    const readback = document.createElement('canvas')
    readback.width = image.width
    readback.height = image.height
    const ctx = readback.getContext('2d')
    if (ctx === null) throw new Error('Screenshot readback context is missing')
    ctx.drawImage(image, 0, 0)
    return ctx.getImageData(0, 0, readback.width, readback.height)
}

export function pixel(image: ImageData, x: number, y: number): number[] {
    const offset = (y * image.width + x) * 4
    return Array.from(image.data.subarray(offset, offset + 3))
}
