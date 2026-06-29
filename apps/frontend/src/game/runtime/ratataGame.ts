import type {
    ClientMessage,
    ServerMessage,
    Vector2,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import type { PointerEvent as ExcaliburPointerEvent } from 'excalibur'
import { Color, DisplayMode, Engine, Flags, PointerButton, PointerScope, vec } from 'excalibur'

import { createCharacterResources, SceneActors } from './sceneActors'
import { loadRenderedTiledMap } from './tiledMap'

interface RatataGameOptions {
    container: HTMLElement
    nickname: string
    onError: (message: string) => void
    onSnapshot: (snapshot: WorldSnapshot, localPlayerId: string | undefined) => void
    onStatus: (message: string) => void
}

export class RatataGame {
    private readonly options: RatataGameOptions
    private canvas: HTMLCanvasElement | undefined
    private engine: Engine | undefined
    private localPlayerId: string | undefined
    private sceneActors: SceneActors | undefined
    private snapshot: WorldSnapshot | undefined
    private socket: WebSocket | undefined
    private readonly pressedKeys = new Set<string>()
    private lastAxis: Vector2 = { x: 0, y: 0 }

    public constructor(options: RatataGameOptions) {
        this.options = options
    }

    public async start(): Promise<void> {
        this.options.onStatus('Loading')
        Flags.useCanvasGraphicsContext()
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
        this.sceneActors = new SceneActors(engine, resources.sheets)
        this.sceneActors.addMap(map)
        this.installInputs(engine, canvas)
        await engine.start(resources.loader)
        this.connect()
    }

    public stop(): void {
        window.removeEventListener('keydown', this.handleKeyDown)
        window.removeEventListener('keyup', this.handleKeyUp)
        this.canvas?.removeEventListener('contextmenu', preventContextMenu)
        this.socket?.close()
        this.engine?.stop()
        this.canvas?.remove()

        if (import.meta.env.DEV) {
            delete window.__ratataGameDebug
        }
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

    private connect(): void {
        this.options.onStatus('Connecting')
        const socket = new WebSocket(resolveWebSocketUrl())
        this.socket = socket
        socket.addEventListener('open', () => {
            this.send({ nickname: this.options.nickname, type: 'join' })
        })
        socket.addEventListener('message', (event) => {
            this.handleSocketMessage(event)
        })
        socket.addEventListener('close', () => {
            this.options.onStatus('Disconnected')
        })
        socket.addEventListener('error', () => {
            this.options.onError('Connection failed')
        })
    }

    private handleSocketMessage(event: MessageEvent<string>): void {
        const message = JSON.parse(event.data) as ServerMessage

        if (message.type === 'world_init') {
            this.localPlayerId = message.playerId
            this.applySnapshot(message.snapshot)
            this.options.onStatus('Connected')
            return
        }

        if (message.type === 'snapshot') {
            this.applySnapshot(message.snapshot)
            return
        }

        if (message.type === 'error') {
            this.options.onError(message.message)
        }
    }

    private applySnapshot(snapshot: WorldSnapshot): void {
        this.snapshot = snapshot
        this.sceneActors?.update(snapshot, this.localPlayerId)
        this.options.onSnapshot(snapshot, this.localPlayerId)
        this.updateDebug()
    }

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.code === 'Space') {
            event.preventDefault()
            this.send({ type: 'attack' })
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
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message))
        }
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

const movementKeys = new Set([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowLeft',
    'ArrowDown',
    'ArrowRight',
])

function axisFromKeys(keys: Set<string>): Vector2 {
    return {
        x: keyAxis(keys, 'KeyD', 'ArrowRight') - keyAxis(keys, 'KeyA', 'ArrowLeft'),
        y: keyAxis(keys, 'KeyS', 'ArrowDown') - keyAxis(keys, 'KeyW', 'ArrowUp'),
    }
}

function keyAxis(keys: Set<string>, primary: string, secondary: string): number {
    return keys.has(primary) || keys.has(secondary) ? 1 : 0
}

function preventContextMenu(event: Event): void {
    event.preventDefault()
}

function resolveWebSocketUrl(): string {
    const envUrl = import.meta.env.VITE_BACKEND_WS_URL

    if (envUrl !== undefined && envUrl.length > 0) {
        return envUrl
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    return `${protocol}//${window.location.hostname}:3000/ws`
}
