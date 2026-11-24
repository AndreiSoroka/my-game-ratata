import type { ClientMessage, Vector2 } from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'

export function parseStopCorrection(
    message: Extract<ClientMessage, { type: 'move_input' }>,
    record: Record<string, unknown> | undefined,
    parsePosition: (value: unknown) => Vector2 | undefined
): ParseResult {
    const id = record?.['id']
    if (!sequenceNumber(id)) {
        return { message }
    }
    const streamId = record?.['streamId']
    const seq = record?.['seq']
    const position = parsePosition(record?.['position'])
    if (
        !sequenceNumber(streamId) ||
        !sequenceNumber(seq) ||
        position === undefined
    ) {
        return { message, invalidStopCorrectionId: id }
    }
    return {
        message: {
            ...message,
            stopCorrection: { id, streamId, seq, position },
        },
    }
}

function sequenceNumber(value: unknown): value is number {
    return (
        typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    )
}
