import assert from 'node:assert/strict'

import type { RoomSocket } from '../apps/backend/src/game/roomMessaging'
import { sendSnapshot } from '../apps/backend/src/game/snapshotStream'
import {
    type BenchmarkScenario,
    createBenchmarkFixture,
} from './snapshot-benchmark-fixture'
import {
    createMetrics,
    recordFrame,
    reportStream,
    round,
    type StreamMetrics,
} from './snapshot-benchmark-metrics'
import { verifyBunWire } from './snapshot-benchmark-wire'

// 36 logical seconds at 20 Hz includes each connection's 30–35 s keyframe.
const frames = 720
const scenarios: BenchmarkScenario[] = ['idle-timers', 'walking', 'combat']

function streamSocket(id: string, metrics: StreamMetrics): RoomSocket {
    return {
        data: { socketId: id },
        getBufferedAmount: () => 0,
        send: (payload: string, compress: boolean): number => {
            assert.equal(
                compress,
                true,
                'Production transport must request compression'
            )
            return recordFrame(metrics, payload)
        },
    } as unknown as RoomSocket
}

function benchmark(
    actorCount: number,
    observers: number,
    scenario: BenchmarkScenario
) {
    const fixture = createBenchmarkFixture(actorCount)
    const full = createMetrics()
    const delta = createMetrics()
    const sockets = Array.from({ length: observers }, (_, index) => ({
        full: streamSocket(`full-${index}`, full),
        delta: streamSocket(`delta-${index}`, delta),
    }))
    try {
        for (let frame = 0; frame < frames; frame += 1) {
            fixture.step(frame, scenario)
            for (const [observer, socket] of sockets.entries()) {
                for (const [deltas, transport, metrics] of [
                    [false, socket.full, full],
                    [true, socket.delta, delta],
                ] as const) {
                    const start = performance.now()
                    const compressionBefore = metrics.compressionMs.length
                    sendSnapshot(
                        transport,
                        () => fixture.snapshot(frame, observer),
                        {
                            playerId: fixture.playerId,
                            stepMs: 50,
                            deltas,
                        }
                    )
                    // Exclude the independently reported compressor work from encoding.
                    const compression =
                        metrics.compressionMs[compressionBefore] ?? 0
                    metrics.encodeMs.push(
                        performance.now() - start - compression
                    )
                }
            }
        }
        const memory = process.memoryUsage()
        assert.equal(full.frames, frames * observers)
        assert.equal(delta.frames, frames * observers)
        assert.ok(
            delta.fullFrames >= observers * 2,
            'Periodic full keyframes must be included'
        )
        const counts = fixture.counts()
        if (scenario === 'walking') assert.ok(counts.movementSamples > frames)
        if (scenario === 'combat') assert.ok(counts.attackStarts >= 2)
        const reduction =
            (1 - delta.compressedBytes / full.compressedBytes) * 100
        return {
            actorCount,
            observers,
            scenario,
            reductionPercent: round(reduction),
            gate70Percent: reduction >= 70,
            controlledActorCommands: true,
            sharedProcessMemoryBytes: {
                heapUsed: memory.heapUsed,
                rss: memory.rss,
            },
            ...counts,
            full: reportStream(full),
            delta: reportStream(delta),
            samples: { full: full.samples, delta: delta.samples },
        }
    } finally {
        fixture.stop()
    }
}

const started = performance.now()
const reports = []
let samples: { full: string[]; delta: string[] } | undefined
for (const actors of [8, 50]) {
    for (const observers of [1, 10]) {
        for (const scenario of scenarios) {
            const result = benchmark(actors, observers, scenario)
            samples ??= result.samples
            const { samples: _samples, ...report } = result
            reports.push(report)
            console.info(JSON.stringify({ kind: 'scenario', ...report }))
        }
    }
}
assert.ok(samples)
const nativeWire = {
    full: await verifyBunWire(samples.full),
    delta: await verifyBunWire(samples.delta),
}
console.info(
    JSON.stringify({
        kind: 'summary',
        bun: Bun.version,
        elapsedMs: round(performance.now() - started),
        logicalStepMs: 50,
        logicalDurationMs: frames * 50,
        fixture:
            'isolated GameRoom; static authored NPC controllers; shared GameCharacter rules',
        codecCpu:
            'snapshot authorization + viewport + JSON normalize + actual per-socket encoder; excludes deflate',
        compression:
            'fresh raw DEFLATE level 6, SYNC_FLUSH minus four-byte trailer, no context takeover',
        byteHeaders:
            'server WebSocket frame headers included; HTTP upgrade/TCP/IP excluded',
        memory: 'shared-process sampled heap/RSS, not attributed independently to modes',
        nativeWire,
        allIdleAndWalkingGatesPass: reports
            .filter(({ scenario }) => scenario !== 'combat')
            .every(({ gate70Percent }) => gate70Percent),
    })
)
assert.ok(
    reports
        .filter(({ scenario }) => scenario !== 'combat')
        .every(({ gate70Percent }) => gate70Percent),
    'Default rollout requires at least 70% compressed wire savings in idle and walking cases'
)
