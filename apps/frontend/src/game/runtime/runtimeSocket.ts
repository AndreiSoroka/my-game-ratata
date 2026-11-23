import type {
    ClientMessage,
    GameEventPayload,
    GameLocale,
    HeroClass,
    MapSummary,
    PlantTreePreview,
    ServerMessage,
    SpeechTranslationServerMessage,
    WorldSnapshot,
} from '@my-game-ratata/contracts'
import { CONTRACT_PROTOCOL_VERSION } from '@my-game-ratata/contracts'
import { watch, type WatchHandle } from 'vue'

import { tGame } from '@/shared/lib/i18n'

interface RuntimeSocketHandlers {
    isStopped: () => boolean
    onError: (message: string) => void
    onEvent: (event: GameEventPayload) => void
    onSpeechTranslation?: (translation: SpeechTranslationServerMessage) => void
    getLocale?: () => GameLocale
    onSnapshot: (snapshot: WorldSnapshot) => void
    onPlantingPreview?: (preview: PlantTreePreview) => void
    onStatus: (message: string) => void
    onWorldInit: (playerId: string, snapshot: WorldSnapshot, map: MapSummary) => void
}

export class RuntimeSocket {
    private readonly handlers: RuntimeSocketHandlers
    private socket: WebSocket | undefined
    private initialized = false
    private sentLocale: GameLocale | undefined
    private stopLocaleWatch: WatchHandle | undefined

    public constructor(handlers: RuntimeSocketHandlers) {
        this.handlers = handlers
    }

    public connect(nickname: string, heroClass?: HeroClass, createOnly = false): void {
        if (this.handlers.isStopped()) return
        this.close()
        this.handlers.onStatus('Connecting')
        const socket = new WebSocket(resolveWebSocketUrl())
        this.initialized = false
        this.socket = socket
        if (this.handlers.getLocale)
            this.stopLocaleWatch = watch(this.handlers.getLocale, () => this.updateLocale(), {
                flush: 'sync',
            })

        socket.addEventListener('open', () => {
            if (this.handlers.isStopped() || this.socket !== socket) return
            const locale = this.handlers.getLocale?.()
            this.sentLocale = locale
            this.send({
                nickname,
                type: 'join',
                ...(locale === undefined ? {} : { locale }),
                ...(heroClass === undefined ? {} : { heroClass }),
                ...(createOnly ? { createOnly: true } : {}),
            })
        })
        socket.addEventListener('message', (event) => {
            if (this.socket === socket) this.handleSocketMessage(event)
        })
        socket.addEventListener('close', () => {
            if (!this.handlers.isStopped() && this.socket === socket) {
                this.disconnect()
                this.handlers.onStatus('Disconnected')
            }
        })
        socket.addEventListener('error', () => {
            if (!this.handlers.isStopped() && this.socket === socket) {
                this.handlers.onError(tGame('game.canvas.connection'))
            }
        })
    }

    public close(): void {
        const socket = this.socket
        this.disconnect()
        socket?.close()
    }

    private disconnect(): void {
        this.socket = undefined
        this.initialized = false
        this.sentLocale = undefined
        this.stopLocaleWatch?.()
        this.stopLocaleWatch = undefined
    }

    private updateLocale(): void {
        const locale = this.handlers.getLocale?.()
        if (!this.initialized || locale === undefined || locale === this.sentLocale) return
        this.sentLocale = locale
        this.send({ type: 'set_locale', locale })
    }

    public send(message: ClientMessage): void {
        if (!this.handlers.isStopped() && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message))
        }
    }

    private handleSocketMessage(event: MessageEvent<string>): void {
        if (this.handlers.isStopped()) return
        const message = JSON.parse(event.data) as ServerMessage

        if (message.type === 'world_init') return this.initialize(message)
        if (message.type === 'error') return this.handlers.onError(errorText(message))
        if (!this.initialized) return
        switch (message.type) {
            case 'snapshot':
                return this.handlers.onSnapshot(message.snapshot)
            case 'plant_tree_preview':
                return this.handlers.onPlantingPreview?.(message)
            case 'event':
                return this.handlers.onEvent(message.event)
            case 'speech_translation':
                return this.deliverTranslation(message)
        }
    }

    private deliverTranslation(message: SpeechTranslationServerMessage): void {
        if (message.locale === this.handlers.getLocale?.())
            this.handlers.onSpeechTranslation?.(message)
    }

    private initialize(message: Extract<ServerMessage, { type: 'world_init' }>): void {
        if (message.protocolVersion !== CONTRACT_PROTOCOL_VERSION) {
            this.close()
            this.handlers.onError(tGame('game.canvas.protocol'))
            this.handlers.onStatus('Disconnected')
            return
        }
        this.initialized = true
        this.updateLocale()
        this.handlers.onWorldInit(message.playerId, message.snapshot, message.map)
    }
}

function errorText(message: Extract<ServerMessage, { type: 'error' }>): string {
    switch (message.code) {
        case 'name_taken':
            return tGame('game.canvas.nameTaken')
        case 'not_joined':
            return tGame('game.canvas.notJoined')
        default:
            return message.message
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

/** Dynamic map JSON is served by the game server; tilesets stay on the frontend. */
export function resolveWorldMapUrl(asset: string): string {
    if (asset.startsWith('/game/map/')) return new URL(asset, window.location.origin).href
    const backend = new URL(resolveWebSocketUrl())
    backend.protocol = backend.protocol === 'wss:' ? 'https:' : 'http:'
    return new URL(asset, backend.origin).href
}
