import type { ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'

import type { MotionTiming } from './ownerMotionLead'
import type { PlantingPreview } from './plantingPreview'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import type { RuntimeMovementControls } from './runtimeMovementControls'
import { createRuntimePresentation } from './runtimePresentation'
import type { SnapshotReference } from './runtimeSnapshotStream'
import type { RuntimeSocket } from './runtimeSocket'
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
    locationId: string,
    planting: PlantingPreview,
    lifecycle: PresentationLifecycle
): Promise<void> {
    const created = createRuntimePresentation(container, map, locationId)
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
        if (lifecycle.current(view)) {
            view.audio.startWorldAmbience()
            view.audio.playMusic()
        } else void run.cancel()
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

export function observeRuntimeAudio(
    view: RuntimePresentation | undefined,
    snapshot: WorldSnapshot,
    playerId: string | undefined
): void {
    view?.audio.observeWorld(snapshot, playerId, view.sceneActors.isPositionVisible, (id) =>
        view.sceneActors.isCharacterVisible(id)
    )
}

export function updateRuntimeScene(
    view: RuntimePresentation | undefined,
    snapshot: WorldSnapshot | undefined,
    playerId: string | undefined,
    reference: SnapshotReference | undefined
): void {
    if (snapshot) view?.sceneActors.update(snapshot, playerId, reference)
}

export function applyMotionTiming(
    view: RuntimePresentation | undefined,
    tickMs: number,
    movement: Pick<RuntimeMovementControls, 'manualAxis'>,
    socket: Pick<RuntimeSocket, 'estimateMotionReceiptTime'>
): MotionTiming {
    const timing = {
        tickMs,
        manualAxis: () => movement.manualAxis,
        estimateReceiptTime: socket.estimateMotionReceiptTime,
    }
    view?.sceneActors.setMotionTiming(timing)
    return timing
}
