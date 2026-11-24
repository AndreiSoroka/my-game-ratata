import { DefaultLoader, Future, type Loadable } from 'excalibur'

import { beginStart, mountEngine, startEngine, stepUntil } from './engineSupport'

class HeldLoader extends DefaultLoader {
    public readonly entered = new Future<void>()
    public readonly gate = new Future<void>()

    public override async onAfterLoad(): Promise<void> {
        this.entered.resolve(undefined)
        await this.gate.promise
        await super.onAfterLoad()
    }
}

export async function verifyCancellation() {
    const abandoned = mountEngine()
    const loader = new HeldLoader({ loadables: [new TestResource()] })
    let cleanupCalls = 0
    abandoned.owner.addCleanup(() => cleanupCalls++)
    const originalStart = beginStart(abandoned, loader)
    await stepUntil(loader.entered.promise, abandoned.clock)
    const originalDisposal = abandoned.owner.cancel()
    const immediate = {
        attached: abandoned.canvas.isConnected,
        running: abandoned.clock.isRunning,
        disposed: abandoned.engine.isDisposed,
        cleanupCalls,
    }

    const replacement = mountEngine()
    try {
        await startEngine(replacement)
        loader.gate.resolve(undefined)
        const [abandonedReady] = await stepUntil(
            Promise.all([originalStart, originalDisposal]),
            abandoned.clock
        )
        await abandoned.owner.cancel()
        return {
            immediate,
            abandonedReady,
            loaderCompleted: loader.isLoaded,
            disposed: abandoned.engine.isDisposed,
            running: abandoned.clock.isRunning,
            cleanupCalls,
            replacement: {
                ...replacement.contextStatus(),
                attached: replacement.canvas.isConnected,
                ready: replacement.engine.isReady,
                running: replacement.clock.isRunning,
            },
        }
    } finally {
        loader.gate.resolve(undefined)
        await stepUntil(originalDisposal, abandoned.clock)
        await replacement.owner.cancel()
    }
}

class TestResource implements Loadable<boolean> {
    public data = false

    public constructor(private readonly broken = false) {}

    public get isLoaded(): boolean {
        return this.data
    }

    public async load(): Promise<boolean> {
        if (this.broken) throw new Error('Fixture resource failed to load')
        this.data = true
        return this.data
    }
}

async function verifyFailure(loader?: DefaultLoader, initialize?: () => never) {
    const run = mountEngine()
    if (initialize !== undefined) run.engine.onInitialize = initialize
    try {
        await stepUntil(beginStart(run, loader), run.clock)
        throw new Error('Expected engine startup to reject')
    } catch (error) {
        return {
            message: String(error),
            attached: run.canvas.isConnected,
            clock: run.clock.isRunning,
            disposed: run.engine.isDisposed,
            engineReady: run.engine.isReady,
        }
    } finally {
        await run.owner.cancel()
    }
}

export async function verifyStartupFailures() {
    const initialization = await verifyFailure(undefined, () => {
        throw new Error('Fixture scene initialization failed')
    })
    const good = new TestResource()
    const bad = new TestResource(true)
    const loader = new DefaultLoader({ loadables: [good, bad] })
    const partial = await verifyFailure(loader)
    return { initialization, partial, loaded: [loader.isLoaded, good.isLoaded, bad.isLoaded] }
}

export async function verifyReentry(entries: number) {
    const outcomes = []
    for (let entry = 0; entry < entries; entry++) {
        const run = mountEngine()
        const context = run.canvas.getContext('webgl2')
        let live: ReturnType<typeof run.contextStatus>
        try {
            await startEngine(run)
            live = run.contextStatus()
        } finally {
            await run.owner.cancel()
        }
        if (run.canvas.isConnected || run.clock.isRunning || !run.engine.isDisposed) {
            throw new Error(`Engine still active after exit ${entry + 1}`)
        }
        // A late restore event must never reach Excalibur on the retired canvas.
        run.canvas.dispatchEvent(new WebGLContextEvent('webglcontextrestored'))
        outcomes.push({ live, retiredLost: context?.isContextLost() ?? false })
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return outcomes
}
