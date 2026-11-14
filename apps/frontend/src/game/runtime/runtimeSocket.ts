import type {
    ClientMessage,
    GameEventPayload,
    HeroClass,
    ServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'

interface RuntimeSocketHandlers {
    isStopped: () => boolean
    onError: (message: string) => void
    onEvent: (event: GameEventPayload) => void
    onSnapshot: (snapshot: WorldSnapshot) => void
    onStatus: (message: string) => void
    onWorldInit: (playerId: string, snapshot: WorldSnapshot) => void
}

export class RuntimeSocket {
    private readonly handlers: RuntimeSocketHandlers
    private socket: WebSocket | undefined

    public constructor(handlers: RuntimeSocketHandlers) {
        this.handlers = handlers
    }

    public connect(nickname: string, heroClass?: HeroClass): void {
        if (this.handlers.isStopped()) return
        this.handlers.onStatus('Connecting')
        const socket = new WebSocket(resolveWebSocketUrl())
        this.socket = socket

        socket.addEventListener('open', () => {
            if (this.handlers.isStopped() || this.socket !== socket) return
            this.send({ nickname, type: 'join', ...(heroClass === undefined ? {} : { heroClass }) })
        })
        socket.addEventListener('message', (event) => {
            this.handleSocketMessage(event)
        })
        socket.addEventListener('close', () => {
            if (!this.handlers.isStopped()) {
                this.handlers.onStatus('Disconnected')
            }
        })
        socket.addEventListener('error', () => {
            if (!this.handlers.isStopped()) {
                this.handlers.onError('Connection failed')
            }
        })
    }

    public close(): void {
        const socket = this.socket
        this.socket = undefined
        socket?.close()
    }

    public send(message: ClientMessage): void {
        if (!this.handlers.isStopped() && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message))
        }
    }

    private handleSocketMessage(event: MessageEvent<string>): void {
        if (this.handlers.isStopped()) return
        const message = JSON.parse(event.data) as ServerMessage

        if (message.type === 'world_init') {
            this.handlers.onWorldInit(message.playerId, message.snapshot)
            return
        }

        if (message.type === 'snapshot') {
            this.handlers.onSnapshot(message.snapshot)
            return
        }

        if (message.type === 'event') {
            this.handlers.onEvent(message.event)
            return
        }

        if (message.type === 'error') {
            this.handlers.onError(message.message)
        }
    }
}

function resolveWebSocketUrl(): string {
    const envUrl = import.meta.env.VITE_BACKEND_WS_URL

    if (envUrl !== undefined && envUrl.length > 0) {
        return envUrl
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

    return `${protocol}//${window.location.hostname}:3000/ws`
}
