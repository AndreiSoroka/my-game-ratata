import type { SpeechActivityCommand } from '@my-game-ratata/contracts'

import { createRandomId } from '@/shared/lib/random-id'

/** Emits presence only. Keystrokes and drafts never leave the input. */
export class SpeechActivityEmitter {
    private id: string | undefined
    private lastInput = 0
    private lastSent = -Infinity
    private timer: ReturnType<typeof setInterval> | undefined
    public constructor(
        private readonly send: (message: SpeechActivityCommand) => void,
        private readonly scope: { channel: 'say' | 'whisper'; targetId?: string },
        private readonly clock = Date.now
    ) {}

    public input(nonempty: boolean): void {
        if (!nonempty) {
            this.stop()
            return
        }
        this.lastInput = this.clock()
        if (!this.id) {
            this.id = createRandomId()
            this.lastSent = -Infinity
            this.timer = setInterval(() => this.tick(), 500)
        }
        this.tick()
    }
    public stop(): void {
        if (this.id)
            this.send({
                type: 'speech_activity',
                active: false,
                activityId: this.id,
                ...this.scope,
            })
        this.id = undefined
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }
    private tick(): void {
        const now = this.clock()
        if (now - this.lastInput >= 3000) {
            this.stop()
            return
        }
        if (this.id && now - this.lastSent >= 1000) {
            this.send({ type: 'speech_activity', active: true, activityId: this.id, ...this.scope })
            this.lastSent = now
        }
    }
}
