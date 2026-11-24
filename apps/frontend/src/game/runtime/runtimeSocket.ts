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

import { resolveBackendHttpUrl, resolveBackendWebSocketUrl } from '@/shared/api'
import { tGame } from '@/shared/lib/i18n'

import { MotionReceiptProbes } from './motionReceiptProbes'
import {
    RuntimeSnapshotStream,
    type SnapshotReceipt,
    type SnapshotReference,
} from './runtimeSnapshotStream'

interface RuntimeSocketHandlers {
    isStopped: () => boolean
    onError: (message: string) => void
    onEvent: (event: GameEventPayload) => void
    onSpeechTranslation?: (translation: SpeechTranslationServerMessage) => void
    getLocale?: () => GameLocale
    onSnapshot: (snapshot: WorldSnapshot, reference: SnapshotReference) => void
    onStreamReset?: () => void
    onSnapshotInvalidated?: () => void
    onPlantingPreview?: (preview: PlantTreePreview) => void
    onStatus: (message: string) => void
    onWorldInit: (
        playerId: string,
        snapshot: WorldSnapshot,
        map: MapSummary,
        reference: SnapshotReference,
        tickMs: number
    ) => void
}

export class RuntimeSocket {
    private readonly handlers: RuntimeSocketHandlers
    private socket: WebSocket | undefined
    private initialized = false
    private sentLocale: GameLocale | undefined
    private stopLocaleWatch: WatchHandle | undefined
    private readonly snapshots = new RuntimeSnapshotStream(import.meta.env.DEV || testMode())
    private readonly motionProbes = new MotionReceiptProbes((message) => this.send(message))
    private resyncTimer: ReturnType<typeof setTimeout> | undefined

    public constructor(handlers: RuntimeSocketHandlers) {
        this.handlers = handlers
    }

    public readonly estimateMotionReceiptTime = (localTime: number): number | undefined =>
        this.motionProbes.estimateReceiptTime(localTime)

    public connect(nickname: string, heroClass?: HeroClass, createOnly = false): void {
        if (this.handlers.isStopped()) return
        this.close()
        this.handlers.onStatus('Connecting')
        const socket = new WebSocket(resolveBackendWebSocketUrl())
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
            if (this.socket !== socket) return
            this.disconnect()
            if (!this.handlers.isStopped()) this.handlers.onStatus('Disconnected')
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
        this.clearResync()
        this.snapshots.clear()
        this.motionProbes.stop()
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
        const message = parseMessage(event.data)
        if (!message) {
            if (this.initialized) this.deliverSnapshot(this.snapshots.invalidate())
            return
        }

        if (message.type === 'world_init') return this.initialize(message)
        if (message.type === 'error') return this.handlers.onError(errorText(message))
        if (!this.initialized) return
        this.handleInitializedMessage(message)
    }

    private handleInitializedMessage(message: ServerMessage): void {
        switch (message.type) {
            case 'snapshot':
            case 'snapshot_delta':
                return this.deliverSnapshot(this.snapshots.receive(message))
            case 'plant_tree_preview':
                return this.handlers.onPlantingPreview?.(message)
            case 'event':
                return this.handlers.onEvent(message.event)
            case 'speech_translation':
                return this.deliverTranslation(message)
            case 'motion_pong':
                return this.motionProbes.receive(message, performance.now())
        }
    }

    private deliverTranslation(message: SpeechTranslationServerMessage): void {
        if (message.locale === this.handlers.getLocale?.())
            this.handlers.onSpeechTranslation?.(message)
    }

    private deliverSnapshot(receipt: SnapshotReceipt): void {
        if (receipt.kind === 'ignored') return
        if (receipt.kind === 'resync') {
            this.motionProbes.stop()
            this.handlers.onSnapshotInvalidated?.()
            this.requestResync()
            return
        }
        const recovered = receipt.full && this.resyncTimer !== undefined
        if (receipt.full) this.clearResync()
        if (receipt.reset) {
            this.motionProbes.stop()
            this.handlers.onStreamReset?.()
        }
        this.handlers.onSnapshot(receipt.snapshot, receipt.reference)
        if (receipt.reset || recovered) this.startMotionProbes()
    }

    private requestResync(): void {
        if (this.resyncTimer !== undefined) return
        const retry = () => {
            if (this.handlers.isStopped() || !this.initialized || !this.socket) return
            this.send({ type: 'snapshot_resync' })
            this.resyncTimer = setTimeout(retry, 3000)
        }
        retry()
    }

    private clearResync(): void {
        clearTimeout(this.resyncTimer)
        this.resyncTimer = undefined
    }

    private initialize(message: Extract<ServerMessage, { type: 'world_init' }>): void {
        if (message.protocolVersion !== CONTRACT_PROTOCOL_VERSION) {
            this.close()
            this.handlers.onError(tGame('game.canvas.protocol'))
            this.handlers.onStatus('Disconnected')
            return
        }
        const receipt = this.snapshots.initialize(message)
        if (receipt.kind !== 'applied') {
            this.close()
            this.handlers.onError(tGame('game.canvas.protocol'))
            this.handlers.onStatus('Disconnected')
            return
        }
        this.clearResync()
        this.motionProbes.stop()
        this.handlers.onStreamReset?.()
        this.initialized = true
        this.updateLocale()
        this.handlers.onWorldInit(
            message.playerId,
            receipt.snapshot,
            message.map,
            receipt.reference,
            message.tickMs
        )
        this.startMotionProbes()
    }

    private startMotionProbes(): void {
        if (
            this.initialized &&
            this.socket?.readyState === WebSocket.OPEN &&
            !this.handlers.isStopped()
        ) {
            this.motionProbes.start()
        }
    }
}

function testMode(): boolean {
    return (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('test') === '1'
    )
}

function parseMessage(data: string): ServerMessage | undefined {
    try {
        const message = JSON.parse(data) as ServerMessage
        return message !== null && typeof message === 'object' ? message : undefined
    } catch {
        return undefined
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

/** Dynamic map JSON is served by the game server; tilesets stay on the frontend. */
export function resolveWorldMapUrl(asset: string): string {
    if (asset.startsWith('/game/map/')) return new URL(asset, window.location.origin).href
    return resolveBackendHttpUrl(asset).href
}
