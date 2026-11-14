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

import { type BuildingEntrance, BuildingEntrances } from './buildingEntrances'
import type { GameAudio } from './gameAudio'
import { axisFromKeys, movementKeys } from './input'
import type { TargetHighlight } from './interactionTargetViews'
import { PlantingPreview } from './plantingPreview'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { characterDisrupted, projectCharacter } from './runtimeCharacterTargets'
import { RuntimeChatInput } from './runtimeChatInput'
import { updateRuntimeDebug } from './runtimeDebug'
import { runtimeEventFeedback } from './runtimeEventFeedback'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { isGameKeyboardBlocked } from './runtimeKeyboardFocus'
import { loadRuntimeMap } from './runtimeMapLoading'
import { RuntimeMovementControls } from './runtimeMovementControls'
import type { RatataGameOptions } from './runtimeOptions'
import { handleRuntimePointer } from './runtimePointer'
import { createRuntimePresentation } from './runtimePresentation'
import { handleRuntimeShortcut } from './runtimeShortcuts'
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
    private readonly plantingPreview = new PlantingPreview()

    public constructor(private readonly options: RatataGameOptions) {
        this.chat = new RuntimeChatInput(options.onChatState, () => {
            this.pressedKeys.clear()
            this.flushMoveInput()
        })
        this.socket = new RuntimeSocket({
            isStopped: () => this.stopped,
            onError: options.onError,
            onEvent: (event) => this.handleServerEvent(event),
            onSnapshot: (snapshot) => this.applySnapshot(snapshot),
            onStatus: (status) => {
                this.connected = status === 'Connected'
                if (status !== 'Connected') this.sceneActors?.setInteractionTarget(undefined)
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
        const { canvas, engine, audio, sceneActors, loader } = createRuntimePresentation(
            this.options.container,
            map
        )
        this.canvas = canvas
        this.engine = engine
        this.audio = audio
        this.sceneActors = sceneActors
        this.plantingPreview.initialize(engine)
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
        this.stopped = true
        this.removeInputs?.()
        this.releaseInputs()
        this.socket.close()
        this.audio?.stop()
        this.sceneActors?.dispose()
        this.plantingPreview.dispose()
        this.buildingEntrances.clear()
        this.engine?.stop()
        this.canvas?.remove()

        if (import.meta.env.DEV) delete window.__ratataGameDebug
    }

    public readonly cancelChat = (): void => this.chat.cancel()

    public releaseUiControls(): void {
        this.releaseInputs()
        const player = this.snapshot?.characters.find((actor) => actor.id === this.localPlayerId)
        if (player?.path.length) this.send({ type: 'move_to', target: { ...player.position } })
    }

    public setInteractionTarget(target: TargetHighlight | undefined): void {
        this.sceneActors?.setInteractionTarget(this.isMapReady ? target : undefined)
    }

    public setPlanting(handler?: (position: Vector2) => void): void {
        this.plantingPreview.set(handler)
        this.releaseInputs()
    }
    public previewPlanting(position: Vector2): void {
        this.plantingPreview.preview(position)
    }

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
        if (this.movementControls.observe(player?.movement, characterDisrupted(player)))
            this.releaseInputs()
        const mapId = snapshot.location?.id ?? CENTER_LOCATION_ID
        if (mapId !== this.mapId) {
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
        this.audio?.setMap(map)
        this.sceneActors?.addMap(map)
        this.buildingEntrances.replace(mapId, map.buildings)
        this.mapId = mapId
        if (this.snapshot) this.sceneActors?.update(this.snapshot, this.localPlayerId)
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (isGameKeyboardBlocked(event)) return
        if (
            this.chat.handleKey(event, (text) => {
                this.send({ text, type: 'chat' })
            })
        ) {
            return
        }

        if (this.movementControls.keyDown(event)) return
        if (
            handleRuntimeShortcut(event, {
                pickup: () => this.send({ type: 'pickup_item' }),
                inventory: () => {
                    this.options.onInventoryToggle()
                    this.audio?.playSound('ui')
                },
                context: this.options.onContextAction
                    ? () => {
                          this.sendCommand({ type: 'move_input', axis: { x: 0, y: 0 } })
                          this.options.onContextAction?.()
                      }
                    : undefined,
            })
        )
            return

        if (movementKeys.has(event.code)) {
            this.send({ type: 'cancel_control' })
            this.pressedKeys.add(event.code)
            this.flushMoveInput()
        }
    }

    private readonly handleKeyUp = (event: KeyboardEvent): void => {
        if (movementKeys.has(event.code)) {
            this.pressedKeys.delete(event.code)
            this.flushMoveInput()
        }
    }

    private readonly releaseInputs = (): void => {
        this.send({ type: 'cancel_control' })
        this.pressedKeys.clear()
        this.flushMoveInput()
        this.movementControls.release()
    }

    private handlePointerDown(event: ExcaliburPointerEvent): void {
        if (this.chat.isActive) return
        handleRuntimePointer(event, {
            snapshot: this.snapshot,
            playerId: this.localPlayerId,
            visible: (id) => this.isCharacterVisible(id),
            plant: (point) => this.plantingPreview.pick(point),
            select: (id) => this.options.onCharacterClick?.(id),
            send: (command) => this.send(command),
        })
    }

    private flushMoveInput(): void {
        const axis = axisFromKeys(this.pressedKeys)

        if (axis.x === this.lastAxis.x && axis.y === this.lastAxis.y) {
            return
        }

        this.lastAxis = axis
        this.send({ axis, type: 'move_input' })
    }

    private send(message: ClientMessage): void {
        this.socket.send(message)
    }

    private handleServerEvent(event: GameEventPayload): void {
        this.options.onEvent?.(event)
        this.audio?.playEventSound(event)
        if (this.loadingMapId === undefined) this.sceneActors?.showDamage(event)
        runtimeEventFeedback(event, this.localPlayerId, this.options, this.releaseInputs)
    }
}
