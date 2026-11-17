import type { WhisperClientMessage } from '@my-game-ratata/contracts'

import { parseExchangeCommand } from './exchangeCommands'
import type { ParseResult } from './messages'
import { parseNpcQuestCommand } from './npcQuestCommands'
import { parseSpeechActivity } from './speechActivity'

export function parseWhisperCommand(
    input: Record<string, unknown>
): WhisperClientMessage | undefined {
    const type = input['type']
    if (type === 'whisper_close') {
        return { type }
    }
    const targetId = input['targetId']
    if (
        typeof targetId !== 'string' ||
        targetId.length === 0 ||
        targetId.length > 100
    ) {
        return undefined
    }
    if (type === 'whisper_open') {
        return { type, targetId }
    }
    const text = input['text']
    if (
        type !== 'whisper' ||
        typeof text !== 'string' ||
        text.trim().length === 0
    ) {
        return undefined
    }
    return { type, targetId, text: text.trim().slice(0, 400) }
}

export function parseSocialBoundary(
    record: Record<string, unknown>
): ParseResult | undefined {
    const type = String(record['type'])
    if (type === 'speech_activity') {
        return parsed(parseSpeechActivity(record))
    }
    if (type.startsWith('whisper')) {
        return parsed(parseWhisperCommand(record))
    }
    if (type.startsWith('exchange_')) {
        return parsed(parseExchangeCommand(record))
    }
    if (type.startsWith('npc_quest_') || type === 'quest_offer_answer') {
        return parsed(parseNpcQuestCommand(record))
    }
    return undefined
}
function parsed(message: ParseResult['message']): ParseResult {
    return message === undefined
        ? { error: 'Invalid social command' }
        : { message }
}
