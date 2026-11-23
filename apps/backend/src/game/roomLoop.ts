import type { NpcAiCoordinator } from '../ai/coordinator'
import { advanceRoomSimulation, type SimulationContext } from './roomSimulation'
import type { WorldClock } from './worldClock'

export const roomTickMs = 50

/** Runs the room on logical time, without accumulating paused intervals as movement. */
export class RoomLoop {
    private timer: ReturnType<typeof setInterval> | undefined
    private lastTickAt: number
    public tick = 0

    public constructor(
        private readonly clock: WorldClock,
        private readonly context: () => Omit<
            SimulationContext,
            'now' | 'deltaMs'
        >,
        private readonly ai: () => NpcAiCoordinator | undefined,
        private readonly refreshPresence: () => boolean
    ) {
        this.lastTickAt = clock.now()
    }

    public start(): void {
        if (this.timer !== undefined) {
            return
        }
        this.timer = setInterval(() => this.advance(), roomTickMs)
        this.ai()?.start()
    }

    public stop(): void {
        this.ai()?.stop()
        if (this.timer !== undefined) {
            clearInterval(this.timer)
            this.timer = undefined
        }
    }

    public resume(): void {
        this.lastTickAt = this.clock.now()
    }

    private advance(): void {
        const context = this.context()
        context.room.social.society.background(
            this.clock.realNow(),
            this.clock.now()
        )
        if (this.clock.paused) {
            return
        }
        const now = this.clock.now()
        const deltaMs = Math.max(1, Math.min(250, now - this.lastTickAt))
        this.lastTickAt = now
        this.tick += 1
        const ai = this.ai()
        context.room.social.npcSpeech.turns.advance(now)
        ai?.beforeTick(now)
        context.onEvents(context.life.ashRites.advance(now))
        advanceRoomSimulation({
            ...context,
            now,
            deltaMs,
            observeAttackResolution: ai?.observeAttackResolution,
        })
        if (!this.refreshPresence()) {
            ai?.afterTick(now)
        }
    }
}
