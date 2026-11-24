import {
    applySnapshotPatch,
    freezeSnapshot,
    normalizeSnapshot,
    type ServerMessage,
    type StopCorrectionRequest,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

type InitialFrame = Extract<ServerMessage, { type: 'world_init' }>
type StateFrame = Extract<ServerMessage, { type: 'snapshot' | 'snapshot_delta' }>
export type SnapshotReference = Pick<StopCorrectionRequest, 'streamId' | 'seq'>
export type SnapshotReceipt =
    | {
          kind: 'applied'
          snapshot: WorldSnapshot
          reference: SnapshotReference
          reset: boolean
          full: boolean
      }
    | { kind: 'ignored' }
    | { kind: 'resync' }

/** Owns the last valid wire state. Presentation never writes into this baseline. */
export class RuntimeSnapshotStream {
    private baseline: WorldSnapshot | undefined
    private streamId = 0
    private seq = -1
    private invalid = false

    public constructor(private readonly freeze = false) {}

    public clear(): void {
        this.baseline = undefined
        this.streamId = 0
        this.seq = -1
        this.invalid = false
    }

    public initialize(message: InitialFrame): SnapshotReceipt {
        this.clear()
        if (message.seq !== 0) return this.invalidate()
        return this.receiveFull(message)
    }

    public receive(message: StateFrame): SnapshotReceipt {
        if (message.type === 'snapshot') return this.receiveFull(message)
        if (this.invalid) return { kind: 'ignored' }
        return this.receiveDelta(message)
    }

    public invalidate(): SnapshotReceipt {
        if (this.invalid) return { kind: 'ignored' }
        this.invalid = true
        return { kind: 'resync' }
    }

    private receiveFull(
        message: InitialFrame | Extract<StateFrame, { type: 'snapshot' }>
    ): SnapshotReceipt {
        if (!validSequence(message)) return this.invalidate()
        if (this.stale(message)) return { kind: 'ignored' }
        try {
            const snapshot = normalizeSnapshot(message.snapshot)
            if (!validSnapshot(snapshot)) return this.invalidate()
            const reset = message.streamId !== this.streamId || regresses(snapshot, this.baseline)
            return this.commit(message, snapshot, reset, true)
        } catch {
            return this.invalidate()
        }
    }

    private receiveDelta(
        message: Extract<StateFrame, { type: 'snapshot_delta' }>
    ): SnapshotReceipt {
        if (!validSequence(message)) return this.invalidate()
        if (this.stale(message)) return { kind: 'ignored' }
        if (!this.matchesBaseline(message)) return this.invalidate()
        const baseline = this.baseline!
        if (!validTime(message) || regresses(message, baseline)) return this.invalidate()
        try {
            const snapshot = applySnapshotPatch(baseline, message.patch, message)
            if (!validSnapshot(snapshot)) return this.invalidate()
            return this.commit(message, snapshot, false, false)
        } catch {
            return this.invalidate()
        }
    }

    private matchesBaseline(message: Extract<StateFrame, { type: 'snapshot_delta' }>): boolean {
        return (
            this.baseline !== undefined &&
            message.streamId === this.streamId &&
            message.baseSeq === this.seq &&
            message.seq === this.seq + 1
        )
    }

    private stale(message: { streamId: number; seq: number }): boolean {
        return (
            message.streamId < this.streamId ||
            (message.streamId === this.streamId && message.seq <= this.seq)
        )
    }

    private commit(
        message: SnapshotReference,
        snapshot: WorldSnapshot,
        reset: boolean,
        full: boolean
    ): SnapshotReceipt {
        this.baseline = this.freeze ? freezeSnapshot(snapshot) : snapshot
        this.streamId = message.streamId
        this.seq = message.seq
        this.invalid = false
        return {
            kind: 'applied',
            snapshot: this.baseline,
            reference: { streamId: message.streamId, seq: message.seq },
            reset,
            full,
        }
    }
}

function validSequence(frame: { streamId: number; seq: number }): boolean {
    return (
        Number.isSafeInteger(frame.streamId) &&
        frame.streamId > 0 &&
        Number.isSafeInteger(frame.seq) &&
        frame.seq >= 0
    )
}

function validTime(frame: { tick: number; serverTime: number; stepMs?: number }): boolean {
    const step = frame.stepMs ?? 0
    return (
        Number.isSafeInteger(frame.tick) &&
        frame.tick >= 0 &&
        Number.isFinite(frame.serverTime) &&
        frame.serverTime >= 0 &&
        Number.isFinite(step) &&
        (step === 0 || (step >= 1 && step <= 250))
    )
}

function validSnapshot(snapshot: WorldSnapshot): boolean {
    return (
        snapshot !== null &&
        typeof snapshot === 'object' &&
        validTime(snapshot) &&
        Array.isArray(snapshot.characters) &&
        Array.isArray(snapshot.items) &&
        Array.isArray(snapshot.chests)
    )
}

function regresses(next: { tick: number; serverTime: number }, previous?: WorldSnapshot): boolean {
    return (
        previous !== undefined &&
        (next.tick < previous.tick || next.serverTime < previous.serverTime)
    )
}
