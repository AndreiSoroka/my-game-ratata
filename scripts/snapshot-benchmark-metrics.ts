import { constants, deflateRawSync } from 'node:zlib'

export interface StreamMetrics {
    frames: number
    fullFrames: number
    rawBytes: number
    compressedBytes: number
    encodeMs: number[]
    compressionMs: number[]
    samples: string[]
}

export function createMetrics(): StreamMetrics {
    return {
        frames: 0,
        fullFrames: 0,
        rawBytes: 0,
        compressedBytes: 0,
        encodeMs: [],
        compressionMs: [],
        samples: [],
    }
}

/** RFC 7692 fresh shared compressor, SYNC_FLUSH trailer removed for each message. */
export function compressFrame(payload: string): Buffer {
    return deflateRawSync(payload, {
        level: 6,
        flush: constants.Z_SYNC_FLUSH,
        finishFlush: constants.Z_SYNC_FLUSH,
    }).subarray(0, -4)
}

/** Server frames have no masking key; TCP/IP and upgrade headers are excluded. */
export function websocketBytes(payloadBytes: number): number {
    return (
        payloadBytes + (payloadBytes < 126 ? 2 : payloadBytes < 65_536 ? 4 : 10)
    )
}

export function recordFrame(metrics: StreamMetrics, payload: string): number {
    const start = performance.now()
    const compressed = compressFrame(payload)
    metrics.compressionMs.push(performance.now() - start)
    metrics.frames += 1
    metrics.rawBytes += websocketBytes(Buffer.byteLength(payload))
    metrics.compressedBytes += websocketBytes(compressed.byteLength)
    if (!payload.startsWith('{"type":"snapshot_delta"')) metrics.fullFrames += 1
    if (metrics.samples.length < 10) metrics.samples.push(payload)
    return Buffer.byteLength(payload)
}

function distribution(values: number[]) {
    const sorted = values.toSorted((a, b) => a - b)
    const at = (quantile: number) =>
        sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0
    return { p50: round(at(0.5)), p95: round(at(0.95)) }
}

export function round(value: number): number {
    return Math.round(value * 1000) / 1000
}

export function reportStream(metrics: StreamMetrics) {
    return {
        frames: metrics.frames,
        fullFrames: metrics.fullFrames,
        rawBytesWithHeaders: metrics.rawBytes,
        compressedBytesWithHeaders: metrics.compressedBytes,
        encodeMs: distribution(metrics.encodeMs),
        deflateMs: distribution(metrics.compressionMs),
    }
}
