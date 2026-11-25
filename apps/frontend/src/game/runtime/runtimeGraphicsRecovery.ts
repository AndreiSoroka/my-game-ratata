export type GraphicsRecoveryState = 'recovering' | 'failed'

const automaticRetryIntervalMs = 15_000

/** A second loss during setup or immediately after recovery waits for a manual retry. */
export class RuntimeGraphicsRecovery {
    private current: GraphicsRecoveryState | undefined
    private lastAttemptAt = -Infinity

    public constructor(
        private readonly changed: (state: GraphicsRecoveryState | undefined) => void
    ) {}

    public get state(): GraphicsRecoveryState | undefined {
        return this.current
    }

    public lost(now: number): boolean {
        if (this.current !== undefined || now - this.lastAttemptAt < automaticRetryIntervalMs) {
            this.set('failed')
            return false
        }
        this.begin(now)
        return true
    }

    public retry(now: number): boolean {
        if (this.current !== 'failed') return false
        this.begin(now)
        return true
    }

    public fail(): boolean {
        if (this.current !== 'recovering') return false
        this.set('failed')
        return true
    }

    public clear(): void {
        this.set(undefined)
    }

    private begin(now: number): void {
        this.lastAttemptAt = now
        this.set('recovering')
    }

    private set(state: GraphicsRecoveryState | undefined): void {
        if (this.current === state) return
        this.current = state
        this.changed(state)
    }
}
