import type { PlantingPreview } from './plantingPreview'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { createRuntimePresentation } from './runtimePresentation'
import type { RenderedTiledMap } from './tiledMap'

export type RuntimePresentation = ReturnType<typeof createRuntimePresentation> & {
    removeInputs: () => void
}
interface PresentationLifecycle {
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
    const view = {
        ...created,
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
    view.removeInputs()
    view.audio.stop()
    view.sceneActors.dispose()
    planting.dispose()
    view.engine.stop()
    view.canvas.remove()
}
