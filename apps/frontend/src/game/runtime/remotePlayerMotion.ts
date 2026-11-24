import type { CharacterSnapshot, Vector2 } from '@my-game-ratata/contracts'

import { motionLineClear, type MotionMap } from './motionCollision'

interface RemoteSample {
    time: number
    position: Vector2
    facing: CharacterSnapshot['facing']
    animation: CharacterSnapshot['animation']
}

const sampleLimit = 8
const bufferTicks = 2
const catchupRate = 1.5

/** Delayed presentation for another player, using only confirmed endpoints. */
export class RemotePlayerMotion {
    private readonly samples: RemoteSample[] = []
    private newest: RemoteSample
    private before: RemoteSample
    private after: RemoteSample | undefined
    private cursor: number
    private lastFrameAt: number | undefined
    private displayed: Vector2
    private walking = false

    public constructor(character: CharacterSnapshot, serverTime: number) {
        const sample = createSample(character, serverTime)
        this.newest = this.before = sample
        this.cursor = sample.time
        this.displayed = sample.position
    }

    public get position(): Vector2 {
        return this.displayed
    }

    public observe(
        character: CharacterSnapshot,
        serverTime: number,
        map: MotionMap | undefined,
        snap = false
    ): void {
        const sample = createSample(character, serverTime)
        if (snap) {
            this.snap(sample)
            return
        }
        if (sample.time <= this.newest.time) return

        if (hasDisplacement(this.newest, sample) && !pathClear(map, this.newest, sample)) {
            this.snap(sample)
            return
        }
        this.newest = sample
        this.samples.push(sample)
        if (this.samples.length > sampleLimit) this.samples.shift()
    }

    public frame(
        serverTime: number,
        localTime: number,
        tickMs: number,
        map: MotionMap | undefined
    ): void {
        const previousFrameAt = this.lastFrameAt ?? localTime
        const elapsed = Math.min(2 * tickMs, Math.max(0, localTime - previousFrameAt))
        this.lastFrameAt = Math.max(localTime, previousFrameAt)
        const target = serverTime - bufferTicks * tickMs
        this.cursor = Math.max(
            this.cursor,
            Math.min(target, this.newest.time, this.cursor + catchupRate * elapsed)
        )
        this.pinBracket()
        const { before, after } = this
        this.walking = false
        this.displayed = before.position
        if (after === undefined || !hasDisplacement(before, after)) return

        if (!pathClear(map, before, after)) {
            // A burst may evict an intermediate turn. Take the confirmed endpoint
            // immediately when the remaining pair has no clear visual segment.
            this.cursor = after.time
            this.before = after
            this.after = undefined
            this.displayed = after.position
            return
        }
        this.walking = before.animation.action === 'walk' || after.animation.action === 'walk'
        const fraction = (this.cursor - before.time) / (after.time - before.time)
        this.displayed = {
            x: before.position.x + (after.position.x - before.position.x) * fraction,
            y: before.position.y + (after.position.y - before.position.y) * fraction,
        }
    }

    public presentation(latest: CharacterSnapshot): CharacterSnapshot {
        const action = latest.animation.action
        if (!latest.alive || latest.movement?.dashing || (action !== 'walk' && action !== 'idle'))
            return latest

        const renderedAction = this.walking ? 'walk' : 'idle'
        const { animation, facing } = this.before
        const startedAt =
            animation.action === renderedAction ? animation.startedAt : this.before.time
        if (
            facing === latest.facing &&
            action === renderedAction &&
            latest.animation.startedAt === startedAt
        )
            return latest
        return { ...latest, facing, animation: { action: renderedAction, startedAt } }
    }

    private pinBracket(): void {
        // The actively displayed bracket stays available when a burst evicts it from the queue.
        if (this.after !== undefined && this.after.time <= this.cursor) {
            this.before = this.after
            this.after = undefined
        }
        for (const sample of this.samples) {
            if (sample.time > this.cursor) {
                if (this.after === undefined || sample.time < this.after.time) this.after = sample
                break
            }
            if (sample.time > this.before.time) this.before = sample
        }
    }

    private snap(sample: RemoteSample): void {
        this.samples.length = 0
        this.newest = this.before = sample
        this.after = undefined
        this.cursor = sample.time
        this.lastFrameAt = undefined
        this.displayed = sample.position
        this.walking = false
    }
}

function createSample(character: CharacterSnapshot, time: number): RemoteSample {
    return {
        time,
        position: { ...character.position },
        facing: character.facing,
        animation: { ...character.animation },
    }
}

function hasDisplacement(before: RemoteSample, after: RemoteSample): boolean {
    return before.position.x !== after.position.x || before.position.y !== after.position.y
}

function pathClear(map: MotionMap | undefined, before: RemoteSample, after: RemoteSample): boolean {
    return map === undefined || motionLineClear(map, before.position, after.position)
}
