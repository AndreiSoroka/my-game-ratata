import type { ClientMessage } from '@my-game-ratata/contracts'

import type { PlantingPreview } from './plantingPreview'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { createRuntimePresentation } from './runtimePresentation'
import { RuntimeViewport } from './runtimeViewport'
import type { RenderedTiledMap } from './tiledMap'

export type RuntimePresentation = ReturnType<typeof createRuntimePresentation> & {
    viewport: RuntimeViewport
}
interface PresentationLifecycle {
    send: (message: ClientMessage) => void
    viewportLocation: () => string | undefined
    inputs: Parameters<typeof installRuntimeInputs>[2]
    mounted: (view: RuntimePresentation) => void
    current: (view: RuntimePresentation) => boolean
    removed: (view: RuntimePresentation) => void
}

/** Socket initialization owns when this begins; disposing an old scene never disposes a new one. */
export async function initializeRuntimePresentation(
    container: HTMLElement,
    map: RenderedTiledMap,
    planting: PlantingPreview,
    lifecycle: PresentationLifecycle
): Promise<void> {
    const created = createRuntimePresentation(container, map)
    const { run, canvas, engine, loader } = created
    const viewport = new RuntimeViewport(lifecycle.send, lifecycle.viewportLocation)
    const view = { ...created, viewport }
    try {
        run.addCleanup(planting.initialize(engine))
        viewport.start(engine)
        run.addCleanup(() => viewport.stop())
        run.addCleanup(installRuntimeInputs(engine, canvas, lifecycle.inputs))
        run.addCleanup(() => lifecycle.removed(view))
        lifecycle.mounted(view)
        if (!(await run.start(loader)) || !run.active) return
        if (lifecycle.current(view)) view.audio.playMusic()
        else void run.cancel()
    } catch (error) {
        void run.cancel()
        throw error
    }
}

export function suspendRuntimePresentation(view: RuntimePresentation | undefined): void {
    if (!view) return
    view.viewport.reset()
    view.audio.suspendWorld()
    view.canvas.style.visibility = 'hidden'
    view.sceneActors.clearDamage()
    view.sceneActors.setInteractionTarget(undefined)
    view.sceneActors.setCombatTarget(undefined)
}
