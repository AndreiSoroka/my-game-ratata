export async function readAdminPayload(
    request: Request
): Promise<Record<string, unknown> | undefined> {
    if (
        request.headers.get('Content-Type')?.split(';')[0]?.trim() !==
        'application/json'
    ) {
        return
    }
    const body = await readAdminBody(
        request.body as ReadableStream<Uint8Array> | null
    )
    if (body === undefined) {
        return
    }
    try {
        const input: unknown = JSON.parse(body.toString('utf8'))
        return input !== null &&
            typeof input === 'object' &&
            !Array.isArray(input)
            ? (input as Record<string, unknown>)
            : undefined
    } catch {
        return undefined
    }
}

async function readAdminBody(
    stream: ReadableStream<Uint8Array> | null
): Promise<Buffer | undefined> {
    if (stream === null) {
        return
    }
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
        for (;;) {
            const part = await reader.read()
            if (part.done) {
                break
            }
            size += part.value.length
            if (size > 1024) {
                void reader.cancel().catch(() => undefined)
                return
            }
            chunks.push(part.value)
        }
        return Buffer.concat(chunks)
    } catch {
        return undefined
    } finally {
        reader.releaseLock()
    }
}
