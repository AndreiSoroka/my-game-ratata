import type {
    ClientMessage,
    EquipmentActionKind,
    EquipmentSlotId,
    GameEventPayload,
    InventoryActionKind,
    Vector2,
    WorldObjectBounds,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import type { PointerEvent as ExcaliburPointerEvent } from 'excalibur'
import { type Engine, PointerButton } from 'excalibur'

import { createCharacterResources } from './characterResources'
import { GameAudio } from './gameAudio'
import { axisFromKeys, movementKeys } from './input'
import type { TargetHighlight } from './interactionTargetViews'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import {
    characterAt,
    characterDisrupted,
    createGameCanvas,
    createGameEngine,
    projectCharacter,
} from './runtimeCharacterTargets'
import { RuntimeChatInput } from './runtimeChatInput'
import { updateRuntimeDebug } from './runtimeDebug'
import { runtimeEventFeedback } from './runtimeEventFeedback'
import { installRuntimeInputs } from './runtimeInputLifecycle'
import { RuntimeMovementControls } from './runtimeMovementControls'
import type { RatataGameOptions } from './runtimeOptions'
import { isEditableTarget } from './runtimeQueries'
import { handleRuntimeShortcut } from './runtimeShortcuts'
import { RuntimeSocket } from './runtimeSocket'
import { SceneActors } from './sceneActors'
import type { RenderedTiledMap } from './tiledMap'
import { loadRenderedTiledMap } from './tiledMap'

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
    private readonly movementControls = new RuntimeMovementControls((command) => this.send(command))
    private readonly pressedKeys = new Set<string>()
    private readonly chat: RuntimeChatInput
    private readonly socket: RuntimeSocket
    private lastAxis: Vector2 = { x: 0, y: 0 }

    public constructor(private readonly options: RatataGameOptions) {
        this.chat = new RuntimeChatInput(options.onChatState)
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
        const canvas = createGameCanvas(this.options.container)
        const resources = createCharacterResources()
        const map = await loadRenderedTiledMap()
        const engine = createGameEngine(canvas)

        this.canvas = canvas
        this.engine = engine
        this.audio = new GameAudio(resources.sounds, resources.music.adventureBegins)
        this.audio.setMap(map)
        this.sceneActors = new SceneActors(
            engine,
            resources.sheets,
            resources.itemImages,
            resources.chestImage,
            resources.farmImage
        )
        this.sceneActors.addMap(map)
        this.removeInputs = installRuntimeInputs(engine, canvas, {
            keyDown: this.handleKeyDown,
            keyUp: this.handleKeyUp,
            release: this.releaseInputs,
            pointer: (event) => this.handlePointerDown(event),
        })
        await engine.start(resources.loader)
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
        this.engine?.stop()
        this.canvas?.remove()

        if (import.meta.env.DEV) {
            delete window.__ratataGameDebug
        }
    }

    public setInteractionTarget(target: TargetHighlight | undefined): void {
        this.sceneActors?.setInteractionTarget(
            !this.connected || this.stopped || this.loadingMapId ? undefined : target
        )
    }

    public setCombatTarget(target: TargetHighlight | undefined): void {
        this.sceneActors?.setCombatTarget(target)
    }
    public setPrayerPreview(preview: PrayerPreviewHighlight | undefined): void {
        this.sceneActors?.setPrayerPreview(
            !this.connected || this.stopped || this.loadingMapId ? undefined : preview
        )
    }
    public projectCharacter(id: string) {
        return this.isCharacterVisible(id)
            ? projectCharacter(this.engine, this.canvas, this.snapshot, id)
            : undefined
    }
    public isPositionVisible(position: Vector2): boolean {
        return this.sceneActors?.isPositionVisible(position) ?? true
    }

    public isInteractionVisible(
        position: Vector2,
        bounds?: WorldObjectBounds,
        range = 48
    ): boolean {
        if (this.stopped || (this.snapshot?.location?.id ?? CENTER_LOCATION_ID) !== this.mapId)
            return false
        return this.sceneActors?.isInteractionVisible(position, bounds, range) ?? false
    }

    public isCharacterVisible(id: string): boolean {
        return this.sceneActors?.isCharacterVisible(id) ?? true
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

    public sendInventoryAction(action: InventoryActionKind, itemInstanceId: string): void {
        this.send({ action, itemInstanceId, type: 'inventory_action' })
    }

    public sendEquipmentAction(action: EquipmentActionKind, slot: EquipmentSlotId): void {
        this.send({ action, slot, type: 'equipment_action' })
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
        try {
            const map = await loadRenderedTiledMap('/game/map', `${mapId}.json`)
            if (this.stopped || this.snapshot?.location?.id !== mapId) return
            this.applyMap(mapId, map)
        } catch (error) {
            this.options.onError(error instanceof Error ? error.message : 'Map loading failed')
        } finally {
            if (this.loadingMapId === mapId) this.loadingMapId = undefined
        }
    }

    private applyMap(mapId: string, map: RenderedTiledMap): void {
        this.audio?.setMap(map)
        this.sceneActors?.addMap(map)
        this.mapId = mapId
        if (this.snapshot) this.sceneActors?.update(this.snapshot, this.localPlayerId)
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (
            event.defaultPrevented ||
            isEditableTarget(event.target) ||
            document.querySelector('[role="dialog"], [role="menu"]')
        ) {
            return
        }
        const wasChatActive = this.chat.isActive

        if (
            this.chat.handleKey(event, (text) => {
                this.send({ text, type: 'chat' })
            })
        ) {
            if (!wasChatActive && this.chat.isActive) {
                this.pressedKeys.clear()
                this.flushMoveInput()
            }

            return
        }

        if (this.movementControls.keyDown(event)) return
        if (
            handleRuntimeShortcut(event, {
                attack: () => this.send({ type: 'attack' }),
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
        if (this.chat.isActive) {
            return
        }

        const target = {
            x: event.worldPos.x,
            y: event.worldPos.y,
        }

        const id = characterAt(this.snapshot, this.localPlayerId, target, (actorId) =>
            this.isCharacterVisible(actorId)
        )
        if (id) {
            this.options.onCharacterClick?.(id)
            return
        }
        if (event.button === PointerButton.Right) return
        this.send({ type: 'cancel_control' })
        this.send({ target, type: 'move_to' })
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
