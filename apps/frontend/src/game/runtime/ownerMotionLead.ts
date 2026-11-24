import type { Vector2 } from '@my-game-ratata/contracts'

export interface MotionTiming {
    tickMs: number
    manualAxis: () => Readonly<Vector2>
    estimateReceiptTime: (localTime: number) => number | undefined
}

const maxLeadMs = 100
const leadChangePerMs = 0.25

/** Adjust only the owner's locomotion clock. Snapshot and combat clocks keep their own time. */
export class OwnerMotionLead {
    private localTime: number | undefined
    private lead = 0
    public time = 0

    public update(
        serverTime: number,
        localTime: number,
        eligible: boolean,
        estimate: number | undefined
    ): number {
        const desired =
            eligible && estimate !== undefined
                ? Math.max(0, Math.min(maxLeadMs, estimate - serverTime))
                : 0
        const elapsed = Math.max(0, localTime - (this.localTime ?? localTime))
        this.localTime = localTime
        const change = elapsed * leadChangePerMs
        this.lead += Math.max(-change, Math.min(change, desired - this.lead))
        this.time = eligible ? Math.max(this.time, serverTime + this.lead) : serverTime
        return this.time
    }

    public reset(): void {
        this.localTime = undefined
        this.lead = 0
        this.time = 0
    }
}
