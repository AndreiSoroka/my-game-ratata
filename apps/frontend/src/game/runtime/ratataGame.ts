import type {
    ClientMessage,
    GameEventPayload,
    ProjectilePath,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import type { Engine, PointerEvent as ExcaliburPointerEvent } from 'excalibur'

import type { WorldSelectionTarget } from '../ui/worldTargetSelection'
import { type BuildingEntrance, BuildingEntrances } from './buildingEntrances'
import type { GameAudio } from './gameAudio'
import { movementKeys } from './input'
import type { TargetHighlight } from './interactionTargetViews'
import { PlantingPreview } from './plantingPreview'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { characterDisrupted, projectCharacter, projectPosition } from './runtimeCharacterTargets'
import { RuntimeChatInput } from './runtimeChatInput'
import { updateRuntimeDebug } from './runtimeDebug'
import { runtimeEventFeedback } from './runtimeEventFeedback'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { handleRuntimeKeyDown } from './runtimeKeyDown'
import { loadRuntimeMap } from './runtimeMapLoading'
import { flushRuntimeMoveInput, RuntimeMovementControls } from './runtimeMovementControls'
import type { RatataGameOptions } from './runtimeOptions'
import { handleRuntimePointer } from './runtimePointer'
import { createRuntimePresentation } from './runtimePresentation'
import {
    runtimeCanSelect,
    type RuntimeSelectionContext,
    runtimeSelectionVisible,
} from './runtimeSelection'
import { RuntimeSocket } from './runtimeSocket'
import type { SceneActors } from './sceneActors'
import { loadRenderedTiledMap, type RenderedTiledMap } from './tiledMap'

export class RatataGame {
    private removeInputs: (() => void) | undefined
    private audio: GameAudio | undefined
    private canvas: HTMLCanvasElement | undefined
    private engine: Engine | undefined
    private localPlayerId: string | undefined
    private sceneActors: SceneActors | undefined
    private snapshot: WorldSnapshot | undefined
    private connected = false
    private stopped = false
    private mapId: string = CENTER_LOCATION_ID
    private loadingMapId: string | undefined
    private readonly buildingEntrances = new BuildingEntrances()
    private readonly movementControls = new RuntimeMovementControls((command) => this.send(command))
    private readonly pressedKeys = new Set<string>()
    private readonly chat: RuntimeChatInput
    private readonly socket: RuntimeSocket
    private lastAxis: Vector2 = { x: 0, y: 0 }
    public selectionTileSize = 16
    public readonly planting = new PlantingPreview(() => this.releaseInputs())

    public constructor(private readonly options: RatataGameOptions) {
        this.chat = new RuntimeChatInput(
            options.onChatState,
            () => {
                this.pressedKeys.clear()
                this.flushMoveInput()
            },
            (message) => this.send(message)
        )
        this.socket = new RuntimeSocket({
            isStopped: () => this.stopped,
            onError: options.onError,
            onEvent: (event) => this.handleServerEvent(event),
            onSnapshot: (snapshot) => this.applySnapshot(snapshot),
            onPlantingPreview: (preview) => this.planting.receive(preview),
            onStatus: (status) => {
                this.connected = status === 'Connected'
                if (status !== 'Connected') {
                    this.chat.stopActivity()
                    this.sceneActors?.clearDamage()
                    this.sceneActors?.setInteractionTarget(undefined)
                    this.sceneActors?.clearWaypoints()
                }
                options.onStatus(status)
            },
            onWorldInit: (playerId, snapshot) => {
                this.connected = true
                this.localPlayerId = playerId
                this.applySnapshot(snapshot)
                this.options.onStatus('Connected')
            },
        })
    }

    public async start(): Promise<void> {
        this.stopped = false
        this.options.onStatus('Loading')
        try {
            await this.startPresentation()
        } catch (error) {
            const cancelled = this.stopped
            this.stop()
            if (!cancelled) throw error
        }
    }

    private async startPresentation(): Promise<void> {
        const map = await loadRenderedTiledMap()
        if (this.stopped) return
        this.selectionTileSize = map.tileWidth
        const { canvas, engine, audio, sceneActors, loader } = createRuntimePresentation(
            this.options.container,
            map
        )
        this.canvas = canvas
        this.engine = engine
        this.audio = audio
        this.sceneActors = sceneActors
        this.planting.initialize(engine)
        this.buildingEntrances.replace(this.mapId, map.buildings)
        this.removeInputs = installRuntimeInputs(engine, canvas, {
            keyDown: this.handleKeyDown,
            keyUp: this.handleKeyUp,
            release: this.releaseInputs,
            pointer: (event) => this.handlePointerDown(event),
        })
        await engine.start(loader)
        if (this.stopped) {
            this.stop()
            return
        }
        this.audio.playMusic()
        this.socket.connect(this.options.nickname, this.options.heroClass)
    }

    public stop(): void {
        this.chat.stopActivity()
        this.stopped = true
        this.removeInputs?.()
        this.releaseInputs()
        this.socket.close()
        this.audio?.stop()
        this.sceneActors?.dispose()
        this.planting.dispose()
        this.buildingEntrances.clear()
        this.engine?.stop()
        this.canvas?.remove()

        if (import.meta.env.DEV) delete window.__ratataGameDebug
    }

    public readonly cancelChat = (): void => this.chat.cancel()

    public readonly releaseUiControls = (): void => this.releaseInputs()

    public setInteractionTarget(target: TargetHighlight | undefined): void {
        this.sceneActors?.setInteractionTarget(this.isMapReady ? target : undefined)
    }

    public readonly projectPosition = (position: Vector2) =>
        projectPosition(this.engine, this.canvas, position)

    public setCombatTarget(target: TargetHighlight | undefined): void {
        this.sceneActors?.setCombatTarget(target)
    }
    public setShotPreview(path: ProjectilePath | undefined): void {
        this.sceneActors?.setShotPreview(this.isMapReady ? path : undefined)
    }
    public setPrayerPreview(preview: PrayerPreviewHighlight | undefined): void {
        this.sceneActors?.setPrayerPreview(this.isMapReady ? preview : undefined)
    }
    public projectCharacter(id: string) {
        return this.isCharacterVisible(id)
            ? projectCharacter(this.engine, this.canvas, this.snapshot, id)
            : undefined
    }
    public isPositionVisible(position: Vector2): boolean {
        return this.isMapReady && (this.sceneActors?.isPositionVisible(position) ?? false)
    }

    public isInteractionVisible(
        position: Vector2,
        bounds?: WorldObjectBounds,
        range = 48
    ): boolean {
        if (!this.isMapReady) return false
        return this.sceneActors?.isInteractionVisible(position, bounds, range) ?? false
    }

    public isCharacterVisible(id: string): boolean {
        return this.isMapReady && (this.sceneActors?.isCharacterVisible(id) ?? false)
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
            viewport: this.isMapReady ? this.engine?.currentScene.camera.viewport : undefined,
            characterVisible: (id) => this.isCharacterVisible(id),
            positionVisible: (point) => this.isPositionVisible(point),
        }
    }

    private get isMapReady(): boolean {
        return this.connected && !this.stopped && this.snapshot?.location?.id === this.mapId
    }

    public getBuildings(): BuildingEntrance[] {
        return this.stopped ? [] : this.buildingEntrances.read(this.snapshot?.location?.id)
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
        const mapId = snapshot.location?.id ?? CENTER_LOCATION_ID
        if (mapId !== this.mapId) {
            this.chat.cancel()
            void this.changeLocation(mapId)
        } else {
            this.sceneActors?.update(snapshot, this.localPlayerId)
        }
        this.options.onSnapshot(snapshot, this.localPlayerId)
        if (mapId === this.mapId) this.audio?.playMovementSound(snapshot, this.localPlayerId)
        updateRuntimeDebug(this.engine, this.snapshot, this.localPlayerId)
    }

    private async changeLocation(mapId: string): Promise<void> {
        if (this.loadingMapId === mapId) return
        this.loadingMapId = mapId
        this.sceneActors?.setInteractionTarget(undefined)
        this.audio?.pauseMovement()
        this.sceneActors?.clearDamage()
        await loadRuntimeMap(
            mapId,
            () => !this.stopped && this.snapshot?.location?.id === mapId,
            (map) => this.applyMap(mapId, map),
            this.options.onError
        )
        if (this.loadingMapId === mapId) this.loadingMapId = undefined
    }

    private applyMap(mapId: string, map: RenderedTiledMap): void {
        this.selectionTileSize = map.tileWidth
        this.audio?.setMap(map)
        this.sceneActors?.addMap(map)
        this.buildingEntrances.replace(mapId, map.buildings)
        this.mapId = mapId
        if (this.snapshot) this.sceneActors?.update(this.snapshot, this.localPlayerId)
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        handleRuntimeKeyDown(event, {
            chat: this.chat,
            movement: this.movementControls,
            send: (command) => this.send(command),
            move: (code) => {
                this.pressedKeys.add(code)
                this.flushMoveInput()
            },
            options: this.options,
            playUi: () => this.audio?.playSound('ui'),
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

    private handlePointerDown(event: ExcaliburPointerEvent): void {
        if (this.chat.isActive) return
        handleRuntimePointer(event, {
            snapshot: this.snapshot,
            playerId: this.localPlayerId,
            visible: (id) => this.canSelectTarget(`character:${id}`),
            resourceVisible: (node) =>
                this.canSelectTarget(`resource:${node.id}`) &&
                this.isInteractionVisible(node.position, node.bounds, Infinity),
            plant: (point) => this.planting.pick(point),
            select: (id) => this.options.onCharacterClick?.(id),
            send: (command) => this.send(command),
        })
    }

    private flushMoveInput(): void {
        this.lastAxis = flushRuntimeMoveInput(this.pressedKeys, this.lastAxis, this.send)
    }

    private readonly send = (message: ClientMessage): void => this.socket.send(message)

    private handleServerEvent(event: GameEventPayload): void {
        this.options.onEvent?.(event)
        this.audio?.playEventSound(event)
        if (this.loadingMapId === undefined) this.sceneActors?.showDamage(event)
        runtimeEventFeedback(event, this.localPlayerId, this.options, this.releaseInputs)
    }
}
