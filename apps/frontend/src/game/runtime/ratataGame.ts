import {
    type ClientMessage,
    type GameEventPayload,
    type MapSummary,
    type ProjectilePath,
    type Vector2,
    type WorldObjectBounds,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { gameLocale } from '@/shared/lib/i18n'

import type { UiSoundId } from '../assets/soundCatalog'
import { focusWorldInput } from '../ui/keyboardOwnership'
import type { WorldSelectionTarget } from '../ui/worldTargetSelection'
import type { BuildingEntrance } from './buildingEntrances'
import type { TargetHighlight } from './interactionTargetViews'
import type { MotionTiming } from './ownerMotionLead'
import { PlantingPreview } from './plantingPreview'
import type { PrayerPreviewHighlight } from './prayerPreviewPresentation'
import { projectCharacter, projectPosition } from './runtimeCharacterTargets'
import { RuntimeChatInput } from './runtimeChatInput'
import { updateRuntimeDebug } from './runtimeDebug'
import { isLocalDeath, runtimeEventFeedback } from './runtimeEventFeedback'
import { handleRuntimeKeyDown } from './runtimeKeyDown'
import { runtimeMapRequest } from './runtimeMapLoading'
import { RuntimeMovementControls } from './runtimeMovementControls'
import type { RatataGameOptions } from './runtimeOptions'
import { createRuntimePointerHandlers } from './runtimePointer'
import {
    applyMotionTiming,
    observeRuntimeAudio,
    updateRuntimeScene,
} from './runtimePresentationLifecycle'
import { runtimeCanSelect, runtimeSelectionVisible } from './runtimeSelection'
import type { SnapshotReference } from './runtimeSnapshotStream'
import { RuntimeSocket } from './runtimeSocket'
import { RuntimeWorldPresentation } from './runtimeWorldPresentation'

export class RatataGame {
    private localPlayerId: string | undefined
    private snapshot: WorldSnapshot | undefined
    private snapshotReference: SnapshotReference | undefined
    private audioSnapshotValid = false
    private motionTiming: MotionTiming | undefined
    private connected = false
    private stopped = false
    private initialMap: MapSummary | undefined
    private readonly world: RuntimeWorldPresentation
    private readonly movement = new RuntimeMovementControls((command) => this.send(command))
    private readonly chat: RuntimeChatInput
    private readonly socket: RuntimeSocket
    public readonly planting = new PlantingPreview(() => this.releaseInputs())
    private readonly pointerHandlers = createRuntimePointerHandlers(() => ({
        engine: this.view?.engine,
        mapReady: this.isMapReady,
        snapshot: this.snapshot,
        playerId: this.localPlayerId,
        characterPosition: (id) => this.view?.sceneActors?.characterPosition(id),
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
        this.world = new RuntimeWorldPresentation(options, this.planting, {
            send: this.send,
            inputs: {
                keyDown: this.handleKeyDown,
                keyUp: this.handleKeyUp,
                release: this.releaseInputs,
                ...this.pointerHandlers,
            },
            active: () => this.connected && !this.stopped,
            suspendInput: (keepChatDraft) => {
                if (!keepChatDraft) this.chat.cancel()
                this.releaseInputs()
            },
            latest: () => ({
                snapshot: this.snapshot,
                playerId: this.localPlayerId,
                reference: this.snapshotReference,
                motionTiming: this.motionTiming,
                audioValid: this.audioSnapshotValid,
            }),
        })
        this.socket = new RuntimeSocket({
            isStopped: () => this.stopped,
            onError: options.onError,
            onEvent: (event, serverTime) => this.handleServerEvent(event, serverTime),
            onSpeechTranslation: options.onSpeechTranslation,
            getLocale: () => gameLocale.value,
            onSnapshot: (snapshot, reference) => this.applySnapshot(snapshot, reference),
            onStreamReset: () => this.invalidateAudioSnapshot('resetMotion'),
            onSnapshotInvalidated: () => this.invalidateAudioSnapshot('holdMotion'),
            onPlantingPreview: (preview) => this.planting.receive(preview),
            onStatus: (status) => {
                this.connected = status === 'Connected'
                if (status !== 'Connected') {
                    this.chat.stopActivity()
                    this.world.stop()
                }
                options.onStatus(status)
            },
            onWorldInit: (playerId, snapshot, map, reference, tickMs, resumeToken) => {
                this.initialMap = map
                this.connected = true
                this.localPlayerId = playerId
                const owner = snapshot.characters.find((character) => character.id === playerId)
                if (owner && resumeToken) options.onResumeToken?.(owner.nickname, resumeToken)
                this.motionTiming = applyMotionTiming(this.view, tickMs, this.movement, this.socket)
                this.applySnapshot(snapshot, reference)
            },
        })
    }

    public start(): Promise<void> {
        this.stopped = false
        this.socket.connect(
            this.options.nickname,
            this.options.heroClass,
            this.options.createOnly,
            this.options.resumeToken,
            this.options.requestResumeToken
        )
        return Promise.resolve()
    }

    public stop(): void {
        if (this.stopped) return
        this.chat.stopActivity()
        this.stopped = true
        this.releaseInputs()
        this.socket.close()
        this.world.stop()
        this.planting.dispose()

        if (import.meta.env.DEV) delete window.__ratataGameDebug
    }

    public readonly cancelChat = (): void => this.chat.cancel()

    public readonly updateChatDraft = (text: string): void => this.chat.setDraft(text)

    public readonly releaseUiControls = (): void => this.releaseInputs()

    public playUiSound(id: UiSoundId): void {
        const view = this.view
        if (this.connected && !this.stopped && view?.engine.isReady) view.audio.playSound(id)
    }

    public readonly projectPosition = (position: Vector2) =>
        projectPosition(this.view?.engine, this.view?.canvas, position)

    public setCombatTarget(target: TargetHighlight | undefined): void {
        this.view?.sceneActors?.setCombatTarget(this.isMapReady ? target : undefined)
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
    public readonly isPositionVisible = (position: Vector2): boolean =>
        this.isMapReady && (this.view?.sceneActors?.isPositionVisible(position) ?? false)

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

    private readonly selectionContext = () => ({
        snapshot: this.snapshot,
        playerId: this.localPlayerId,
        tileSize: this.selectionTileSize,
        viewport: this.isMapReady ? this.view?.engine?.currentScene.camera.viewport : undefined,
        characterVisible: (id: string) => this.isCharacterVisible(id),
        characterPosition: (id: string) => this.view?.sceneActors?.characterPosition(id),
        positionVisible: this.isPositionVisible,
        interactionVisible: (point: Vector2, bounds?: WorldObjectBounds, range?: number) =>
            this.isInteractionVisible(point, bounds, range),
    })

    private get isMapReady(): boolean {
        return this.world.ready
    }

    public readonly getBuildings = (): BuildingEntrance[] =>
        this.isMapReady ? this.world.entrances.read(this.snapshot?.location?.id) : []

    public sendCommand(message: ClientMessage): void {
        this.movement.sendCommand(message)
    }

    private applySnapshot(snapshot: WorldSnapshot, reference: SnapshotReference): void {
        this.snapshot = snapshot
        this.snapshotReference = reference
        this.audioSnapshotValid = true
        const player = snapshot.characters.find((character) => character.id === this.localPlayerId)
        if (!player?.alive) this.chat.cancel()
        if (this.movement.observe(player)) this.releaseInputs()
        this.world.observe(runtimeMapRequest(snapshot, this.initialMap))
        if (this.isMapReady) updateRuntimeScene(this.view, snapshot, this.localPlayerId, reference)
        this.options.onSnapshot(snapshot, this.localPlayerId)
        if (this.isMapReady) observeRuntimeAudio(this.view, snapshot, this.localPlayerId)
        updateRuntimeDebug(this.view, this.snapshot, this.localPlayerId)
    }

    private invalidateAudioSnapshot(motion?: 'resetMotion' | 'holdMotion'): void {
        if (motion) this.view?.sceneActors[motion]()
        this.audioSnapshotValid = false
        this.view?.audio.invalidateWorld(motion === undefined)
    }

    public readonly retryMap = (): void => this.world.retryMap()

    public readonly retryGraphics = (): void => this.world.retryGraphics()

    public get selectionTileSize(): number {
        return this.world.selectionTileSize
    }

    private get view() {
        return this.world.view
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.isMapReady) return
        handleRuntimeKeyDown(event, {
            chat: this.chat,
            movement: this.movement,
            send: (command) => this.send(command),
            move: (code) => this.movement.move(code),
            options: this.options,
            stopMovement: () => this.sendCommand({ type: 'move_input', axis: { x: 0, y: 0 } }),
        })
    }

    private readonly handleKeyUp = (event: KeyboardEvent): void => this.movement.keyUp(event.code)

    private readonly releaseInputs = (): void => {
        this.chat.stopActivity()
        this.send({ type: 'release_input' })
        this.movement.release()
    }

    private readonly send = (message: ClientMessage): void => {
        const command = this.movement.prepareCommand(
            message,
            this.isMapReady ? this.view?.sceneActors : undefined
        )
        this.options.onCommand?.(command)
        this.socket.send(command)
    }

    private handleServerEvent(event: GameEventPayload, serverTime: number): void {
        this.options.onEvent?.(event)
        this.view?.audio.playEventSound(event, this.isMapReady ? serverTime : undefined)
        if (isLocalDeath(event, this.localPlayerId)) this.invalidateAudioSnapshot()
        if (this.isMapReady) this.view?.sceneActors?.showDamage(event)
        runtimeEventFeedback(event, this.localPlayerId, this.options, this.releaseInputs)
    }
}
