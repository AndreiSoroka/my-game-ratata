import { setTimeout as wait } from 'node:timers/promises'

import {
    DEFAULT_WORLD_EMPTY_MODE,
    type GameReadiness,
    type WorldEmptyMode,
} from '@my-game-ratata/contracts'

import type { ReadyNpcAi } from './ai/startupProbe'

interface StartableRoom {
    start(): void
    stop(): void
    setEmptyWorldMode(mode: WorldEmptyMode): void
}

export class GameStartup<Room extends StartableRoom> {
    private readonly abort = new AbortController()
    private status: GameReadiness['state'] = 'checking'
    private mode: WorldEmptyMode = DEFAULT_WORLD_EMPTY_MODE
    private pending?: Promise<void>
    private game?: Room

    public constructor(
        private readonly prepare: (signal: AbortSignal) => Promise<ReadyNpcAi>,
        private readonly createRoom: (
            ai: ReadyNpcAi,
            mode: WorldEmptyMode
        ) => Room,
        private readonly retry: (signal: AbortSignal) => Promise<void> = (
            signal
        ) => wait(30_000, undefined, { signal })
    ) {}

    public get readiness(): GameReadiness['state'] {
        return this.status
    }

    public get room(): Room | undefined {
        return this.game
    }

    public get worldMode(): WorldEmptyMode {
        return this.mode
    }

    public setWorldMode(mode: WorldEmptyMode): void {
        this.room?.setEmptyWorldMode(mode)
        this.mode = mode
    }

    public start(): Promise<void> {
        this.pending ??= this.startWhenReady(this.abort.signal).catch(
            (error: unknown) => {
                if (!this.abort.signal.aborted) {
                    throw error
                }
            }
        )
        return this.pending
    }

    public stop(): void {
        this.abort.abort()
        this.room?.stop()
    }

    private async startWhenReady(signal: AbortSignal): Promise<void> {
        for (;;) {
            signal.throwIfAborted()
            this.status = 'checking'
            let ready: ReadyNpcAi
            try {
                ready = await this.prepare(signal)
            } catch {
                signal.throwIfAborted()
                this.status = 'ai_unavailable'
                console.warn('NPC AI unavailable; retrying startup checks')
                await this.retry(signal)
                continue
            }
            signal.throwIfAborted()
            const room = this.createRoom(ready, this.mode)
            room.start()
            this.game = room
            this.status = 'ready'
            console.info(`Game room ready with NPC AI via ${ready.name}`)
            return
        }
    }
}
