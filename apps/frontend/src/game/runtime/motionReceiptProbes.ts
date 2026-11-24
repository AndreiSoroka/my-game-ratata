import type { MotionPingClientMessage, MotionPongServerMessage } from '@my-game-ratata/contracts'

const probeIntervalMs = 1000
const maxRoundTripMs = 300
const sampleLifetimeMs = 5000
const maxSamples = 5

interface ReceiptSample {
    receivedAt: number
    roundTripMs: number
    offset: number
}

/** A browser send time plus the estimated offset gives the server's input receipt time. */
export class MotionReceiptProbes {
    private started = false
    private nextId = 1
    private timer: ReturnType<typeof setInterval> | undefined
    private pending: { id: number; sentAt: number } | undefined
    private samples: ReceiptSample[] = []
    private lastServerReceivedAt = -Infinity
    private offset: number | undefined

    public constructor(private readonly send: (message: MotionPingClientMessage) => void) {}

    public start(): void {
        if (this.started) return
        this.started = true
        document.addEventListener('visibilitychange', this.handleVisibility)
        this.handleVisibility()
    }

    public stop(): void {
        this.started = false
        document.removeEventListener('visibilitychange', this.handleVisibility)
        this.clear()
    }

    public receive({ id, serverReceivedAt }: MotionPongServerMessage, localTime: number): void {
        if (!this.pending || id !== this.pending.id) return
        const { sentAt } = this.pending
        this.pending = undefined
        const roundTripMs = localTime - sentAt
        if (
            roundTripMs < 0 ||
            roundTripMs > maxRoundTripMs ||
            !Number.isFinite(serverReceivedAt) ||
            serverReceivedAt < 0 ||
            serverReceivedAt < this.lastServerReceivedAt
        ) {
            return
        }
        this.lastServerReceivedAt = serverReceivedAt
        this.expireSamples(localTime)
        this.samples.push({ receivedAt: localTime, roundTripMs, offset: serverReceivedAt - sentAt })
        if (this.samples.length > maxSamples) this.samples.shift()
        this.updateOffset()
    }

    public estimateReceiptTime(localTime: number): number | undefined {
        this.expireSamples(localTime)
        return this.offset === undefined ? undefined : localTime + this.offset
    }

    private readonly handleVisibility = (): void => {
        this.clear()
        if (document.hidden) return
        this.sendProbe()
        this.timer = setInterval(this.sendProbe, probeIntervalMs)
    }

    private readonly sendProbe = (): void => {
        const id = this.nextId++
        // A prior probe expires at the next send, one second later.
        this.pending = { id, sentAt: performance.now() }
        this.send({ id, type: 'motion_ping' })
    }

    private expireSamples(localTime: number): void {
        const oldest = this.samples[0]
        if (!oldest || localTime - oldest.receivedAt <= sampleLifetimeMs) return
        this.samples = this.samples.filter(
            ({ receivedAt }) => localTime - receivedAt <= sampleLifetimeMs
        )
        this.updateOffset()
    }

    private updateOffset(): void {
        const fastest = [...this.samples].sort((a, b) => a.roundTripMs - b.roundTripMs).slice(0, 3)
        this.offset =
            fastest.length === 3
                ? fastest.map(({ offset }) => offset).sort((a, b) => a - b)[1]
                : undefined
    }

    private clear(): void {
        clearInterval(this.timer)
        this.timer = undefined
        this.pending = undefined
        this.samples = []
        this.lastServerReceivedAt = -Infinity
        this.offset = undefined
    }
}
