import type { ClientMessage } from '@my-game-ratata/contracts'

import type { PlantingPreview } from './plantingPreview'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { createRuntimePresentation } from './runtimePresentation'
import { RuntimeViewport } from './runtimeViewport'
import type { RenderedTiledMap } from './tiledMap'

export type RuntimePresentation = ReturnType<typeof createRuntimePresentation> & {
    removeInputs: () => void
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
    created.canvas.style.visibility = 'hidden'
    planting.initialize(created.engine)
    const viewport = new RuntimeViewport(lifecycle.send, lifecycle.viewportLocation)
    viewport.start(created.engine)
    const view = {
        ...created,
        viewport,
        removeInputs: installRuntimeInputs(created.engine, created.canvas, lifecycle.inputs),
    }
    lifecycle.mounted(view)
    try {
        await view.engine.start(view.loader)
    } catch (error) {
        disposeRuntimePresentation(view, planting)
        lifecycle.removed(view)
        throw error
    }
    if (lifecycle.current(view)) view.audio.playMusic()
    else {
        disposeRuntimePresentation(view, planting)
        lifecycle.removed(view)
    }
}

export function disposeRuntimePresentation(
    view: RuntimePresentation | undefined,
    planting: PlantingPreview
): void {
    if (!view) return
    view.viewport.stop()
    view.removeInputs()
    view.audio.stop()
    view.sceneActors.dispose()
    planting.dispose()
    view.engine.stop()
    view.canvas.remove()
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
