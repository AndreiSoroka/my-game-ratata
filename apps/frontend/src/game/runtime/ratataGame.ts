import type {
    ClientMessage,
    GameEventPayload,
    MapSummary,
    ProjectilePath,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { focusWorldInput } from '../ui/keyboardOwnership'
import type { WorldSelectionTarget } from '../ui/worldTargetSelection'
import { type BuildingEntrance, BuildingEntrances } from './buildingEntrances'
import { movementKeys } from './input'
import type { TargetHighlight } from './interactionTargetViews'
import { PlantingPreview } from './plantingPreview'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { characterDisrupted, projectCharacter, projectPosition } from './runtimeCharacterTargets'
import { RuntimeChatInput } from './runtimeChatInput'
import { updateRuntimeDebug } from './runtimeDebug'
import { runtimeEventFeedback } from './runtimeEventFeedback'
import { handleRuntimeKeyDown } from './runtimeKeyDown'
import { RuntimeMapLoading, runtimeMapRequest } from './runtimeMapLoading'
import { flushRuntimeMoveInput, RuntimeMovementControls } from './runtimeMovementControls'
import type { RatataGameOptions } from './runtimeOptions'
import { createRuntimePointerHandlers } from './runtimePointer'
import {
    disposeRuntimePresentation,
    initializeRuntimePresentation,
    type RuntimePresentation,
} from './runtimePresentationLifecycle'
import {
    runtimeCanSelect,
    type RuntimeSelectionContext,
    runtimeSelectionVisible,
} from './runtimeSelection'
import { RuntimeSocket } from './runtimeSocket'
import type { RenderedTiledMap } from './tiledMap'

export class RatataGame {
    private view: RuntimePresentation | undefined
    private localPlayerId: string | undefined
    private snapshot: WorldSnapshot | undefined
    private connected = false
    private stopped = false
    private mapId: string = CENTER_LOCATION_ID
    private initialMap: MapSummary | undefined
    private readonly maps: RuntimeMapLoading
    private readonly buildingEntrances = new BuildingEntrances()
    private readonly movementControls = new RuntimeMovementControls((command) => this.send(command))
    private readonly pressedKeys = new Set<string>()
    private readonly chat: RuntimeChatInput
    private readonly socket: RuntimeSocket
    private lastAxis: Vector2 = { x: 0, y: 0 }
    public selectionTileSize = 16
    public readonly planting = new PlantingPreview(() => this.releaseInputs())
    private readonly pointerHandlers = createRuntimePointerHandlers(() => ({
        engine: this.view?.engine,
        mapReady: this.isMapReady,
        snapshot: this.snapshot,
        playerId: this.localPlayerId,
        canSelect: (key) => this.canSelectTarget(key),
        chat: this.chat,
        plant: (point) => this.planting.pick(point),
        resourceVisible: (node) => this.isInteractionVisible(node.position, node.bounds, Infinity),
        options: this.options,
        send: this.send,
    }))

    public constructor(private readonly options: RatataGameOptions) {
        this.chat = new RuntimeChatInput(
            options.onChatState,
            this.releaseInputs,
            (message) => this.send(message),
            () => focusWorldInput(true)
        )
        this.maps = new RuntimeMapLoading({
            apply: async (map, request) => {
                if (this.view) this.applyMap(request.locationId, map)
                else await this.startPresentation(map, request.locationId)
            },
            loading: () => this.suspendMap(),
            ready: () => this.resumeMap(),
            failed: (message) => {
                this.options.onStatus('Map loading failed')
                ;(this.options.onMapError ?? this.options.onError)(message)
            },
        })
        this.socket = new RuntimeSocket({
            isStopped: () => this.stopped,
            onError: options.onError,
            onEvent: (event) => this.handleServerEvent(event),
            onSnapshot: (snapshot) => this.applySnapshot(snapshot),
            onPlantingPreview: (preview) => this.planting.receive(preview),
            onStatus: (status) => {
                this.connected = status === 'Connected'
                if (status !== 'Connected') {
                    this.maps.stop()
                    if (this.view) this.view.canvas.style.visibility = 'hidden'
                    this.chat.stopActivity()
                    this.view?.sceneActors?.clearDamage()
                    this.view?.sceneActors?.setInteractionTarget(undefined)
                    this.view?.sceneActors?.clearWaypoints()
                }
                options.onStatus(status)
            },
            onWorldInit: (playerId, snapshot, map) => {
                this.initialMap = map
                this.connected = true
                this.localPlayerId = playerId
                this.applySnapshot(snapshot)
            },
        })
    }

    public start(): Promise<void> {
        this.stopped = false
        this.options.onStatus('Connecting')
        this.socket.connect(this.options.nickname, this.options.heroClass, this.options.createOnly)
        return Promise.resolve()
    }

    private startPresentation(map: RenderedTiledMap, mapId: string): Promise<void> {
        return initializeRuntimePresentation(this.options.container, map, this.planting, {
            inputs: {
                keyDown: this.handleKeyDown,
                keyUp: this.handleKeyUp,
                release: this.releaseInputs,
                ...this.pointerHandlers,
            },
            mounted: (view) => {
                this.view = view
                this.selectionTileSize = map.tileWidth
                this.buildingEntrances.replace(mapId, map.buildings)
                this.mapId = mapId
            },
            current: (view) => !this.stopped && this.view === view,
            removed: (view) => {
                if (this.view === view) this.view = undefined
            },
        })
    }

    public stop(): void {
        this.chat.stopActivity()
        this.stopped = true
        this.maps.stop()
        this.releaseInputs()
        this.socket.close()
        disposeRuntimePresentation(this.view, this.planting)
        this.view = undefined
        this.buildingEntrances.clear()

        if (import.meta.env.DEV) delete window.__ratataGameDebug
    }

    public readonly cancelChat = (): void => this.chat.cancel()

    public readonly updateChatDraft = (text: string): void => this.chat.setDraft(text)

    public readonly releaseUiControls = (): void => this.releaseInputs()

    public setInteractionTarget(target: TargetHighlight | undefined): void {
        this.view?.sceneActors?.setInteractionTarget(this.isMapReady ? target : undefined)
    }

    public readonly projectPosition = (position: Vector2) =>
        projectPosition(this.view?.engine, this.view?.canvas, position)

    public setCombatTarget(target: TargetHighlight | undefined): void {
        this.view?.sceneActors?.setCombatTarget(target)
    }
    public setShotPreview(path: ProjectilePath | undefined): void {
        this.view?.sceneActors?.setShotPreview(this.isMapReady ? path : undefined)
    }
    public setPrayerPreview(preview: PrayerPreviewHighlight | undefined): void {
        this.view?.sceneActors?.setPrayerPreview(this.isMapReady ? preview : undefined)
    }
    public projectCharacter(id: string) {
        if (!this.isCharacterVisible(id)) return undefined
        const position = this.view?.sceneActors?.characterPosition(id)
        return projectCharacter(this.view?.engine, this.view?.canvas, this.snapshot, id, position)
    }
    public isPositionVisible(position: Vector2): boolean {
        return this.isMapReady && (this.view?.sceneActors?.isPositionVisible(position) ?? false)
    }

    public isInteractionVisible(
        position: Vector2,
        bounds?: WorldObjectBounds,
        range = 48
    ): boolean {
        if (!this.isMapReady) return false
        return this.view?.sceneActors?.isInteractionVisible(position, bounds, range) ?? false
    }

    public isCharacterVisible(id: string): boolean {
        return this.isMapReady && (this.view?.sceneActors?.isCharacterVisible(id) ?? false)
    }

    public isSelectionVisible(target: WorldSelectionTarget): boolean {
        return runtimeSelectionVisible(target, this.selectionContext())
    }

    public canSelectTarget(key: string): boolean {
        return runtimeCanSelect(key, this.selectionContext())
    }

    private selectionContext(): RuntimeSelectionContext {
        return {
            snapshot: this.snapshot,
            playerId: this.localPlayerId,
            tileSize: this.selectionTileSize,
            viewport: this.isMapReady ? this.view?.engine?.currentScene.camera.viewport : undefined,
            characterVisible: (id) => this.isCharacterVisible(id),
            positionVisible: (point) => this.isPositionVisible(point),
        }
    }

    private get isMapReady(): boolean {
        return this.connected && !this.stopped && this.maps.isReady
    }

    public getBuildings(): BuildingEntrance[] {
        return this.isMapReady ? this.buildingEntrances.read(this.snapshot?.location?.id) : []
    }

    public sendCommand(message: ClientMessage): void {
        if (message.type === 'movement_mode') this.movementControls.acceptMode(message.mode)
        if (message.type === 'move_input' || message.type === 'move_to') {
            if (message.type === 'move_input' && message.axis.x === 0 && message.axis.y === 0)
                this.movementControls.release()
            this.pressedKeys.clear()
            this.lastAxis = message.type === 'move_input' ? message.axis : { x: 0, y: 0 }
        }
        this.send(message)
    }

    private applySnapshot(snapshot: WorldSnapshot): void {
        this.snapshot = snapshot
        const player = snapshot.characters.find((character) => character.id === this.localPlayerId)
        if (!player?.alive) this.chat.cancel()
        if (this.movementControls.observe(player?.movement, characterDisrupted(player)))
            this.releaseInputs()
        this.maps.observe(runtimeMapRequest(snapshot, this.initialMap))
        if (this.isMapReady) this.view?.sceneActors?.update(snapshot, this.localPlayerId)
        this.options.onSnapshot(snapshot, this.localPlayerId)
        if (this.isMapReady) this.view?.audio?.playMovementSound(snapshot, this.localPlayerId)
        updateRuntimeDebug(this.view, this.snapshot, this.localPlayerId)
    }

    public retryMap(): void {
        this.maps.retry()
    }

    private suspendMap(): void {
        this.chat.cancel()
        this.releaseInputs()
        this.view?.sceneActors?.setInteractionTarget(undefined)
        this.view?.audio?.pauseMovement()
        this.view?.sceneActors?.clearDamage()
        if (this.view) this.view.canvas.style.visibility = 'hidden'
        this.options.onMapError?.(null)
        this.options.onStatus('Loading map')
    }

    private resumeMap(): void {
        if (this.stopped) return
        if (this.view) this.view.canvas.style.visibility = ''
        this.options.onMapError?.(null)
        this.options.onStatus('Connected')
        if (this.snapshot) this.view?.sceneActors?.update(this.snapshot, this.localPlayerId)
    }

    private applyMap(mapId: string, map: RenderedTiledMap): void {
        this.selectionTileSize = map.tileWidth
        this.view?.audio?.setMap(map)
        this.view?.sceneActors?.addMap(map)
        this.buildingEntrances.replace(mapId, map.buildings)
        this.mapId = mapId
        if (this.snapshot) this.view?.sceneActors?.update(this.snapshot, this.localPlayerId)
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.isMapReady) return
        handleRuntimeKeyDown(event, {
            chat: this.chat,
            movement: this.movementControls,
            send: (command) => this.send(command),
            move: (code) => {
                this.pressedKeys.add(code)
                this.flushMoveInput()
            },
            options: this.options,
            playUi: () => this.view?.audio?.playSound('ui'),
            stopMovement: () => this.sendCommand({ type: 'move_input', axis: { x: 0, y: 0 } }),
        })
    }

    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        if (movementKeys.has(event.code)) {
            this.pressedKeys.delete(event.code)
            this.flushMoveInput()
        }
    }

    private readonly releaseInputs = (): void => {
        this.chat.stopActivity()
        this.send({ type: 'release_input' })
        this.pressedKeys.clear()
        this.lastAxis = { x: 0, y: 0 }
        this.movementControls.release()
    }

    private flushMoveInput(): void {
        this.lastAxis = flushRuntimeMoveInput(this.pressedKeys, this.lastAxis, this.send)
    }

    private readonly send = (message: ClientMessage): void => {
        this.options.onCommand?.(message)
        this.socket.send(message)
    }

    private handleServerEvent(event: GameEventPayload): void {
        this.options.onEvent?.(event)
        this.view?.audio?.playEventSound(event)
        if (this.isMapReady) this.view?.sceneActors?.showDamage(event)
        runtimeEventFeedback(event, this.localPlayerId, this.options, this.releaseInputs)
    }
}
