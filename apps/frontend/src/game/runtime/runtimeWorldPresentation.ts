import type { ClientMessage, WorldSnapshot } from '@my-game-ratata/contracts'

import { focusWorldInput } from '../ui/keyboardOwnership'
import { BuildingEntrances } from './buildingEntrances'
import type { MotionTiming } from './ownerMotionLead'
import type { PlantingPreview } from './plantingPreview'
import { RuntimeGraphicsRecovery } from './runtimeGraphicsRecovery'
import type { installRuntimeInputs } from './runtimeInputLifecycle'
import { RuntimeMapLoading, type RuntimeMapRequest } from './runtimeMapLoading'
import type { RatataGameOptions } from './runtimeOptions'
import {
    initializeRuntimePresentation,
    observeRuntimeAudio,
    type RuntimePresentation,
    suspendRuntimePresentation,
    updateRuntimeScene,
} from './runtimePresentationLifecycle'
import type { SnapshotReference } from './runtimeSnapshotStream'
import type { RenderedTiledMap } from './tiledMap'

interface WorldPresentationContext {
    send: (message: ClientMessage) => void
    inputs: Parameters<typeof installRuntimeInputs>[2]
    active: () => boolean
    suspendInput: (keepChatDraft: boolean) => void
    latest: () => {
        snapshot: WorldSnapshot | undefined
        playerId: string | undefined
        reference: SnapshotReference | undefined
        motionTiming: MotionTiming | undefined
        audioValid: boolean
    }
}

/** Presentation can be replaced while the socket, authoritative snapshots and Vue stay alive. */
export class RuntimeWorldPresentation {
    public view: RuntimePresentation | undefined
    public selectionTileSize = 16
    public readonly entrances = new BuildingEntrances()
    private mapId: string | undefined
    private request: RuntimeMapRequest | undefined
    private restoreFocus = false
    private readonly maps: RuntimeMapLoading
    private readonly graphics: RuntimeGraphicsRecovery

    public constructor(
        private readonly options: Pick<
            RatataGameOptions,
            'container' | 'onError' | 'onGraphicsRecovery' | 'onMapError' | 'onStatus'
        >,
        private readonly planting: PlantingPreview,
        private readonly context: WorldPresentationContext
    ) {
        this.graphics = new RuntimeGraphicsRecovery((state) => options.onGraphicsRecovery?.(state))
        this.maps = new RuntimeMapLoading({
            apply: async (map, request) => {
                if (this.view) this.applyMap(map, request.locationId)
                else await this.startView(map, request.locationId)
            },
            loading: () => this.suspend(),
            ready: () => this.resume(),
            failed: (message) => this.failed(message),
        })
    }

    public get ready(): boolean {
        return this.context.active() && this.maps.isReady
    }

    public observe(request: RuntimeMapRequest | undefined): void {
        this.request = request
        if (this.graphics.state !== 'failed') this.maps.observe(request)
    }

    public stop(): void {
        this.maps.stop()
        this.graphics.clear()
        this.restoreFocus = false
        this.request = undefined
        void this.view?.run.cancel()
        this.entrances.clear()
    }

    public retryMap(): void {
        this.maps.retry()
    }

    public retryGraphics(): void {
        if (!this.context.active() || !this.graphics.retry(performance.now())) return
        this.restoreFocus = true
        this.maps.invalidatePresentation()
        this.maps.observe(this.request)
    }

    private startView(map: RenderedTiledMap, mapId: string): Promise<void> {
        return initializeRuntimePresentation(this.options.container, map, mapId, this.planting, {
            send: this.context.send,
            viewportLocation: () => (this.ready ? this.mapId : undefined),
            inputs: this.context.inputs,
            mounted: (view) => {
                this.view = view
                const { motionTiming } = this.context.latest()
                if (motionTiming) view.sceneActors.setMotionTiming(motionTiming)
                this.setMapGeometry(map, mapId)
            },
            current: (view) => this.context.active() && this.view === view,
            removed: (view) => {
                if (this.view === view) this.view = undefined
            },
            contextLost: (view) => this.handleLoss(view),
        })
    }

    private handleLoss(view: RuntimePresentation): void {
        if (!this.context.active() || this.view !== view) return
        this.restoreFocus ||= document.activeElement === view.canvas
        const restart = this.graphics.lost(performance.now())
        this.maps.invalidatePresentation()
        void view.run.cancel()
        if (restart) this.maps.observe(this.request)
        else {
            this.context.suspendInput(true)
            this.options.onStatus('Graphics recovery failed')
        }
    }

    private suspend(): void {
        this.context.suspendInput(this.graphics.state !== undefined)
        suspendRuntimePresentation(this.view)
        this.options.onMapError?.(null)
        this.options.onStatus('Loading map')
    }

    private failed(message: string): void {
        if (this.graphics.fail()) {
            this.options.onStatus('Graphics recovery failed')
            return
        }
        this.options.onStatus('Map loading failed')
        ;(this.options.onMapError ?? this.options.onError)(message)
    }

    private resume(): void {
        const view = this.view
        const { snapshot, playerId, reference, audioValid } = this.context.latest()
        if (!this.context.active() || !view || !snapshot) return
        view.canvas.style.visibility = ''
        this.graphics.clear()
        if (this.restoreFocus) {
            this.restoreFocus = false
            queueMicrotask(() => {
                if (this.view === view && document.activeElement === document.body)
                    focusWorldInput()
            })
        }
        this.options.onMapError?.(null)
        this.options.onStatus('Connected')
        view.sceneActors.update(snapshot, playerId, reference)
        view.audio.resumeWorld()
        if (audioValid) observeRuntimeAudio(view, snapshot, playerId)
    }

    private applyMap(map: RenderedTiledMap, mapId: string): void {
        this.view?.audio.setMap(map, mapId)
        this.view?.sceneActors.addMap(map)
        this.setMapGeometry(map, mapId)
        const { snapshot, playerId, reference } = this.context.latest()
        updateRuntimeScene(this.view, snapshot, playerId, reference)
    }

    private setMapGeometry(map: RenderedTiledMap, mapId: string): void {
        this.selectionTileSize = map.tileWidth
        this.entrances.replace(mapId, map.buildings)
        this.mapId = mapId
    }
}
