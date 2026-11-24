/** A scene-local estimate of gameplay time. Packet jitter must never rewind it. */
export class MotionClock {
    private samples: { at: number; offset: number }[] = []
    private tick: number | undefined
    private offset = 0
    private estimated = 0

    public observe(serverTime: number, tick: number, receivedAt: number): boolean {
        if (this.tick !== undefined && tick <= this.tick) return false
        if (this.tick !== undefined) this.now(receivedAt)
        this.samples = this.samples.filter((sample) => receivedAt - sample.at <= 2000)
        this.samples.push({ at: receivedAt, offset: serverTime - receivedAt })
        this.offset = Math.max(...this.samples.map((sample) => sample.offset))
        this.estimated = Math.max(this.estimated, receivedAt + this.offset)
        this.tick = tick
        return true
    }

    public now(localTime: number): number {
        if (this.tick === undefined) return 0
        this.estimated = Math.max(this.estimated, localTime + this.offset)
        return this.estimated
    }

    public reset(): void {
        this.samples = []
        this.tick = undefined
        this.offset = this.estimated = 0
    }
}
