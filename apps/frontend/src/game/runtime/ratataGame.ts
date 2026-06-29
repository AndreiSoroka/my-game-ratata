import type {
    ClientMessage,
    EquipmentActionKind,
    EquipmentSlotId,
    GameEventPayload,
    InventoryActionKind,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { PointerEvent as ExcaliburPointerEvent } from 'excalibur'
import { Color, DisplayMode, Engine, PointerButton, PointerScope, vec } from 'excalibur'

import { createCharacterResources } from './characterResources'
import { chatDuration, type ChatInputState } from './chatInput'
import { GameAudio } from './gameAudio'
import { axisFromKeys, movementKeys, preventContextMenu } from './input'
import { RuntimeChatInput } from './runtimeChatInput'
import { RuntimeSocket } from './runtimeSocket'
import { SceneActors } from './sceneActors'
import { loadRenderedTiledMap } from './tiledMap'

interface RatataGameOptions {
    container: HTMLElement
    nickname: string
    onChatState: (state: ChatInputState) => void
    onError: (message: string) => void
    onInventoryToggle: () => void
    onSnapshot: (snapshot: WorldSnapshot, localPlayerId: string | undefined) => void
    onStatus: (message: string) => void
}

export class RatataGame {
    private readonly options: RatataGameOptions
    private audio: GameAudio | undefined
    private canvas: HTMLCanvasElement | undefined
    private engine: Engine | undefined
    private localPlayerId: string | undefined
    private sceneActors: SceneActors | undefined
    private snapshot: WorldSnapshot | undefined
    private stopped = false
    private readonly pressedKeys = new Set<string>()
    private readonly chat: RuntimeChatInput
    private readonly socket: RuntimeSocket
    private lastAxis: Vector2 = { x: 0, y: 0 }

    public constructor(options: RatataGameOptions) {
        this.options = options
        this.chat = new RuntimeChatInput(options.onChatState)
        this.socket = new RuntimeSocket({
            isStopped: () => this.stopped,
            onError: options.onError,
            onEvent: (event) => {
                this.handleServerEvent(event)
            },
            onSnapshot: (snapshot) => {
                this.applySnapshot(snapshot)
            },
            onStatus: options.onStatus,
            onWorldInit: (playerId, snapshot) => {
                this.localPlayerId = playerId
                this.applySnapshot(snapshot)
                this.options.onStatus('Connected')
            },
        })
    }

    public async start(): Promise<void> {
        this.stopped = false
        this.options.onStatus('Loading')
        const canvas = this.createCanvas()
        const resources = createCharacterResources()
        const map = await loadRenderedTiledMap()
        const engine = new Engine({
            backgroundColor: Color.fromHex('#0b0d0c'),
            canvasElement: canvas,
            displayMode: DisplayMode.FillContainer,
            pixelArt: true,
            pointerScope: PointerScope.Canvas,
            suppressPlayButton: true,
        })

        this.canvas = canvas
        this.engine = engine
        this.audio = new GameAudio(resources.sounds, resources.music.adventureBegins)
        this.sceneActors = new SceneActors(
            engine,
            resources.sheets,
            resources.itemImages,
            resources.chestImage
        )
        this.sceneActors.addMap(map)
        this.installInputs(engine, canvas)
        await engine.start(resources.loader)
        this.audio.playMusic()
        this.socket.connect(this.options.nickname)
    }

    public stop(): void {
        this.stopped = true
        window.removeEventListener('keydown', this.handleKeyDown)
        window.removeEventListener('keyup', this.handleKeyUp)
        this.canvas?.removeEventListener('contextmenu', preventContextMenu)
        this.socket.close()
        this.audio?.stop()
        this.engine?.stop()
        this.canvas?.remove()

        if (import.meta.env.DEV) {
            delete window.__ratataGameDebug
        }
    }

    public sendInventoryAction(action: InventoryActionKind, itemInstanceId: string): void {
        this.send({
            action,
            itemInstanceId,
            type: 'inventory_action',
        })
    }

    public sendEquipmentAction(action: EquipmentActionKind, slot: EquipmentSlotId): void {
        this.send({
            action,
            slot,
            type: 'equipment_action',
        })
    }

    private createCanvas(): HTMLCanvasElement {
        const canvas = document.createElement('canvas')
        canvas.className = 'game-canvas'
        canvas.dataset.gameCanvas = 'true'
        canvas.tabIndex = 0
        this.options.container.append(canvas)

        return canvas
    }

    private installInputs(engine: Engine, canvas: HTMLCanvasElement): void {
        window.addEventListener('keydown', this.handleKeyDown)
        window.addEventListener('keyup', this.handleKeyUp)
        canvas.addEventListener('contextmenu', preventContextMenu)
        engine.input.pointers.primary.on('down', (event) => {
            this.handlePointerDown(event)
        })
    }

    private applySnapshot(snapshot: WorldSnapshot): void {
        this.snapshot = snapshot
        this.sceneActors?.update(snapshot, this.localPlayerId)
        this.options.onSnapshot(snapshot, this.localPlayerId)
        this.audio?.playMovementSound(snapshot, this.localPlayerId)
        this.updateDebug()
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
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

        if (event.code === 'Space') {
            event.preventDefault()
            this.send({ type: 'attack' })
            return
        }

        if (event.code === 'KeyE') {
            event.preventDefault()
            this.send({ type: 'pickup_item' })
            return
        }

        if (event.code === 'KeyI') {
            event.preventDefault()
            this.options.onInventoryToggle()
            this.audio?.playSound('ui')
            return
        }

        if (movementKeys.has(event.code)) {
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

    private handlePointerDown(event: ExcaliburPointerEvent): void {
        if (this.chat.isActive) {
            return
        }

        const target = {
            x: event.worldPos.x,
            y: event.worldPos.y,
        }

        if (event.button === PointerButton.Right || this.shouldAttackAt(target)) {
            this.send({ type: 'attack' })
            return
        }

        this.send({ target, type: 'move_to' })
    }

    private shouldAttackAt(point: Vector2): boolean {
        const snapshot = this.snapshot

        if (snapshot === undefined) {
            return false
        }

        return snapshot.characters.some(
            (character) =>
                character.id !== this.localPlayerId &&
                character.alive &&
                Math.hypot(character.position.x - point.x, character.position.y - point.y) <= 24
        )
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
        this.audio?.playEventSound(event)

        if (event.kind !== 'chat' || event.actorId === undefined || event.text === undefined) {
            return
        }

        this.sceneActors?.showChat(event.actorId, event.text, chatDuration(event.text))
    }

    private updateDebug(): void {
        if (!import.meta.env.DEV) {
            return
        }

        window.__ratataGameDebug = {
            lastSnapshot: this.snapshot,
            localPlayerId: this.localPlayerId,
            worldToPage: (point) => {
                const pagePoint = this.engine?.screen.worldToPageCoordinates(vec(point.x, point.y))

                if (pagePoint === undefined) {
                    return undefined
                }

                return { x: pagePoint.x, y: pagePoint.y }
            },
        }
    }
}
