import type { WorldEmptyMode } from '@my-game-ratata/contracts'

/** Gameplay time excludes intervals during which the empty room is paused. */
export class WorldClock {
    private pausedAt: number | undefined
    private excluded = 0
    public allowsAutonomy = false
    public resumeRevision = 0

    public constructor(private readonly wallNow: () => number) {}

    public readonly now = (): number =>
        (this.pausedAt ?? this.wallNow()) - this.excluded

    public readonly realNow = (): number => this.wallNow()

    public get paused(): boolean {
        return this.pausedAt !== undefined
    }

    public setMode(mode: WorldEmptyMode, occupied: boolean) {
        const before = this.paused
        const wasAutonomous = this.allowsAutonomy
        this.allowsAutonomy = occupied || mode === 'always'
        const paused = !occupied && mode === 'paused_when_empty'
        this.setPaused(paused)
        return {
            paused,
            resumed: before && !paused,
            suspended: wasAutonomous && !this.allowsAutonomy,
        }
    }

    private setPaused(paused: boolean): void {
        if (paused && this.pausedAt === undefined) {
            this.pausedAt = this.wallNow()
        } else if (!paused && this.pausedAt !== undefined) {
            this.excluded += this.wallNow() - this.pausedAt
            this.pausedAt = undefined
            this.resumeRevision += 1
        }
    }
}
