import type {
    CharacterArchetype,
    ClientMessage,
    Vector2,
} from '@my-game-ratata/contracts'

export interface ParseResult {
    error?: string
    message?: ClientMessage
}

export function readSocketMessage(raw: unknown): string | undefined {
    if (typeof raw === 'string') {
        return raw
    }

    if (raw instanceof ArrayBuffer) {
        return Buffer.from(raw).toString('utf-8')
    }

    if (ArrayBuffer.isView(raw)) {
        return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString(
            'utf-8'
        )
    }

    return undefined
}

export function parseClientMessage(raw: string): ParseResult {
    let input: unknown

    try {
        input = JSON.parse(raw) as unknown
    } catch {
        return { error: 'Invalid JSON' }
    }

    const record = asRecord(input)

    if (record === undefined) {
        return { error: 'Message must be an object' }
    }

    return parseRecord(record)
}

function parseRecord(record: Record<string, unknown>): ParseResult {
    switch (record['type']) {
        case 'join':
            return parseJoin(record)
        case 'move_input':
            return parseMoveInput(record)
        case 'move_to':
            return parseMoveTo(record)
        case 'attack':
            return { message: { type: 'attack' } }
        case 'chat':
            return parseChat(record)
        default:
            return { error: 'Unknown message type' }
    }
}

function parseJoin(record: Record<string, unknown>): ParseResult {
    const nickname = record['nickname']

    if (typeof nickname !== 'string' || nickname.trim().length === 0) {
        return { error: 'Nickname is required' }
    }

    const archetype = parseArchetype(record['archetype'])
    const message = {
        nickname: nickname.trim().slice(0, 24),
        type: 'join',
    } satisfies ClientMessage

    if (archetype === undefined) {
        return { message }
    }

    return { message: { ...message, archetype } }
}

function parseMoveInput(record: Record<string, unknown>): ParseResult {
    const axis = parseVector(record['axis'])

    if (axis === undefined) {
        return { error: 'move_input.axis must be a vector' }
    }

    return { message: { axis, type: 'move_input' } }
}

function parseMoveTo(record: Record<string, unknown>): ParseResult {
    const target = parseVector(record['target'])

    if (target === undefined) {
        return { error: 'move_to.target must be a vector' }
    }

    return { message: { target, type: 'move_to' } }
}

function parseChat(record: Record<string, unknown>): ParseResult {
    const text = record['text']

    if (typeof text !== 'string') {
        return { error: 'chat.text must be a string' }
    }

    const trimmed = text.trim().slice(0, 100)

    if (trimmed.length === 0) {
        return { error: 'chat.text is required' }
    }

    return { message: { text: trimmed, type: 'chat' } }
}

function parseVector(input: unknown): Vector2 | undefined {
    const record = asRecord(input)

    if (record === undefined) {
        return undefined
    }

    const x = record['x']
    const y = record['y']

    if (typeof x !== 'number' || typeof y !== 'number') {
        return undefined
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return undefined
    }

    return { x, y }
}

function parseArchetype(input: unknown): CharacterArchetype | undefined {
    if (input === 'human' || input === 'skeleton' || input === 'slime') {
        return input
    }

    return undefined
}

function asRecord(input: unknown): Record<string, unknown> | undefined {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return undefined
    }

    return input as Record<string, unknown>
}
