import assert from 'node:assert/strict'
import { createConnection } from 'node:net'
import { constants, inflateRawSync } from 'node:zlib'

import { compressFrame, websocketBytes } from './snapshot-benchmark-metrics'

interface WireFrame {
    compressed: boolean
    payload: Buffer
    bytes: number
}

/** A real Bun upgrade verifies negotiated compression and actual server frame sizes. */
export async function verifyBunWire(payloads: string[]) {
    assert.equal(payloads.length, 10)
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch(request, current) {
            return current.upgrade(request)
                ? undefined
                : new Response(null, { status: 400 })
        },
        websocket: {
            perMessageDeflate: true,
            open(socket) {
                for (const payload of payloads)
                    assert.notEqual(socket.send(payload, true), 0)
            },
            message() {},
        },
    })
    try {
        assert.ok(server.port)
        const captured = await captureFrames(server.port, payloads.length)
        assert.match(
            captured.headers,
            /Sec-WebSocket-Extensions:.*permessage-deflate/i
        )
        assert.match(captured.headers, /server_no_context_takeover/i)
        for (const [index, frame] of captured.frames.entries()) {
            assert.equal(frame.compressed, true, `Frame ${index} must use RSV1`)
            const decoded = inflateRawSync(
                Buffer.concat([frame.payload, Buffer.from([0, 0, 255, 255])]),
                { finishFlush: constants.Z_SYNC_FLUSH }
            ).toString()
            assert.equal(decoded, payloads[index])
            const payload = payloads[index]
            assert.ok(payload)
            assert.equal(
                frame.bytes,
                websocketBytes(compressFrame(payload).byteLength)
            )
        }
        return {
            messages: captured.frames.length,
            negotiated: captured.headers
                .split('\r\n')
                .find((line) => /Sec-WebSocket-Extensions:/i.test(line)),
            nativeCompressedBytesWithHeaders: captured.frames.reduce(
                (sum, frame) => sum + frame.bytes,
                0
            ),
            estimatedCompressedBytesWithHeaders: payloads.reduce(
                (sum, payload) =>
                    sum + websocketBytes(compressFrame(payload).byteLength),
                0
            ),
            exactIndependentInflation: true,
            exactCompressedByteEstimate: true,
        }
    } finally {
        await server.stop(true)
    }
}

function captureFrames(port: number, count: number) {
    return new Promise<{ headers: string; frames: WireFrame[] }>(
        (resolve, reject) => {
            const socket = createConnection({ host: '127.0.0.1', port })
            let headers: string | undefined
            let pending = Buffer.alloc(0)
            const frames: WireFrame[] = []
            const timer = setTimeout(
                () => finish(new Error('Bun WebSocket probe timed out')),
                5000
            )
            function finish(error?: Error) {
                clearTimeout(timer)
                socket.destroy()
                if (error !== undefined) reject(error)
                else resolve({ headers: headers ?? '', frames })
            }
            socket.on('error', finish)
            socket.on('connect', () =>
                socket.write(
                    [
                        'GET / HTTP/1.1',
                        `Host: 127.0.0.1:${port}`,
                        'Upgrade: websocket',
                        'Connection: Upgrade',
                        'Sec-WebSocket-Key: c25hcHNob3QtYmVuY2htaw==',
                        'Sec-WebSocket-Version: 13',
                        'Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover',
                        '\r\n',
                    ].join('\r\n')
                )
            )
            socket.on('data', (data) => {
                try {
                    receive(Buffer.from(data))
                } catch (error) {
                    finish(
                        error instanceof Error
                            ? error
                            : new Error(String(error))
                    )
                }
            })
            function receive(data: Buffer) {
                pending = Buffer.concat([pending, data])
                if (headers === undefined) {
                    const end = pending.indexOf('\r\n\r\n')
                    if (end < 0) return
                    headers = pending.subarray(0, end).toString()
                    assert.match(headers, /^HTTP\/1\.1 101 /)
                    pending = pending.subarray(end + 4)
                }
                let frame = readFrame(pending)
                while (frame !== undefined) {
                    frames.push(frame)
                    pending = pending.subarray(frame.bytes)
                    frame = readFrame(pending)
                }
                if (frames.length >= count) finish()
            }
        }
    )
}

function readFrame(data: Buffer): WireFrame | undefined {
    if (data.length < 2) return undefined
    const first = data[0] ?? 0
    const second = data[1] ?? 0
    assert.equal(first & 128, 128, 'Probe expects complete final messages')
    assert.equal(second & 128, 0, 'Server frames must be unmasked')
    assert.equal(first & 15, 1, 'Probe expects text frames')
    const short = second & 127
    let header = 2
    let length = short
    if (short === 126) {
        if (data.length < 4) return undefined
        header = 4
        length = data.readUInt16BE(2)
    } else if (short === 127) {
        if (data.length < 10) return undefined
        header = 10
        length = Number(data.readBigUInt64BE(2))
    }
    if (data.length < header + length) return undefined
    return {
        compressed: (first & 64) !== 0,
        payload: data.subarray(header, header + length),
        bytes: header + length,
    }
}
