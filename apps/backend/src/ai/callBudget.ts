const windowMs = 3_600_000

/** Shared rolling budget for dialogue, follow-up lookups and compact advice. */
export class NpcAiCallBudget {
    private readonly calls: number[] = []
    private readonly background: number[] = []

    public constructor(private readonly hourlyLimit: number) {}

    public spend(at: number, background: boolean): void {
        this.calls.push(at)
        if (background) {
            this.background.push(at)
        }
    }

    public limit(
        at: number,
        background: boolean
    ):
        | {
              reason: 'background_call_limit' | 'hourly_call_limit'
              until: number
          }
        | undefined {
        this.trim(at)
        if (
            background &&
            this.background.length >= Math.floor((this.hourlyLimit * 2) / 3)
        ) {
            return {
                reason: 'background_call_limit',
                until: (this.background[0] ?? at) + windowMs,
            }
        }
        if (this.calls.length >= this.hourlyLimit) {
            return {
                reason: 'hourly_call_limit',
                until: (this.calls[0] ?? at) + windowMs,
            }
        }
        return undefined
    }

    private trim(at: number): void {
        for (const calls of [this.calls, this.background]) {
            while (calls[0] !== undefined && calls[0] <= at - windowMs) {
                calls.shift()
            }
        }
    }
}
