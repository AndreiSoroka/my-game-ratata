import {
    DefaultLoader,
    Engine,
    type EngineOptions,
    ExcaliburGraphicsContextWebGL,
    Future,
    PointerScope,
} from 'excalibur'

export const webglEngineOptions = {
    configurePerformanceCanvas2DFallback: { allow: false },
    pixelArt: true,
    suppressMinimumBrowserFeatureDetection: true,
}

export function createWebglEngine(
    options: EngineOptions & { canvasElement: HTMLCanvasElement }
): Engine {
    const engine = new Engine({
        ...options,
        ...webglEngineOptions,
        global: options.canvasElement,
        grabWindowFocus: false,
        pointerScope: PointerScope.Canvas,
    })
    // Excalibur can still fall back during construction if WebGL2 is unavailable.
    if (!(engine.graphicsContext instanceof ExcaliburGraphicsContextWebGL)) {
        engine.dispose()
        engine.browser.clear()
        throw new Error('WebGL2 is required to start Excalibur')
    }
    return engine
}

/** The app and previews own their loading UI. Use Excalibur's asset and audio loading directly. */
export class EngineAssetLoader extends DefaultLoader {
    public override onInitialize(engine: Engine): void {
        this.engine = engine
        this.canvas.draw = () => undefined
    }

    public override onAfterLoad(): Promise<void> {
        return Promise.resolve()
    }
}

/** Owns one canvas and engine, including the time needed for an interrupted loader to settle. */
export class EngineRun {
    public readonly engine: Engine
    private readonly cleanups: (() => void)[] = []
    private readonly released = new Future<void>()
    private startup: Promise<boolean> | undefined
    private starting = false
    private cancelled = false

    public constructor(
        private readonly canvas: HTMLCanvasElement,
        createEngine: () => Engine,
        private readonly surface: HTMLElement = canvas
    ) {
        try {
            this.engine = createEngine()
        } catch (error) {
            surface.remove()
            throw error
        }
    }

    public get active(): boolean {
        return !this.cancelled
    }

    public addCleanup(cleanup: () => void): void {
        if (this.active) this.cleanups.push(cleanup)
        else cleanup()
    }

    public start(loader: DefaultLoader): Promise<boolean> {
        if (!this.active) return Promise.resolve(false)
        this.startup ??= this.startEngine(loader)
        return this.startup
    }

    public cancel(): Promise<void> {
        if (this.active) {
            this.cancelled = true
            this.surface.remove()
            for (const cleanup of this.cleanups.splice(0).reverse()) cleanup()
            this.engine.setInputEnabled(false)
            if (!this.starting) this.disposeEngine()
        }
        return this.released.promise
    }

    private async startEngine(loader: DefaultLoader): Promise<boolean> {
        this.starting = true
        try {
            await this.engine.start(loader)
            if (!this.active) return false
            if (!loader.isLoaded) throw new Error('Excalibur did not finish loading its resources')
            return true
        } catch (error) {
            if (!this.active) return false
            void this.cancel()
            throw error
        } finally {
            this.starting = false
            // Excalibur uses its clock for the loader's delays, even when its canvas is detached.
            if (!this.active) this.disposeEngine()
        }
    }

    private disposeEngine(): void {
        const gl =
            this.engine.graphicsContext instanceof ExcaliburGraphicsContextWebGL
                ? this.canvas.getContext('webgl2')
                : null
        try {
            this.engine.stop()
        } finally {
            try {
                this.engine.dispose()
            } finally {
                this.engine.browser.clear()
                if (gl) releaseWebglContext(this.canvas, gl)
                this.released.resolve(undefined)
            }
        }
    }
}

function releaseWebglContext(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void {
    // Excalibur releases its own objects but leaves the native context in the browser's quota.
    // A retired canvas must not dispatch context events to callbacks on the disposed engine.
    const ignoreRetiredContext = (event: Event) => event.stopImmediatePropagation()
    canvas.addEventListener('webglcontextlost', ignoreRetiredContext, true)
    canvas.addEventListener('webglcontextrestored', ignoreRetiredContext, true)
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext()
}
