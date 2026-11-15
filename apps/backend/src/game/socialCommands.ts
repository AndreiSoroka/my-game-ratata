import { isQuestRewardMode } from '@my-game-ratata/contracts'

import type { ParseResult } from './messages'

export function parseSocialCommand(
    record: Record<string, unknown>
): ParseResult {
    const type = record['type']
    const targetId = record['targetId']
    const invitationId = record['invitationId']
    const accept = record['accept']
    if (type === 'party_leave') {
        return { message: { type } }
    }
    if (type === 'party_invite' && validId(targetId)) {
        return { message: { type, targetId } }
    }
    if (
        type === 'party_answer' &&
        validId(invitationId) &&
        typeof accept === 'boolean'
    ) {
        return { message: { type, invitationId, accept } }
    }
    return parseGuildCommand(record)
}

function parseGuildCommand(record: Record<string, unknown>): ParseResult {
    const type = record['type']
    const questId = record['questId']
    if (
        type === 'guild_turn_in' ||
        type === 'guild_report' ||
        type === 'guild_abandon'
    ) {
        const instanceId = record['instanceId']
        return validId(instanceId)
            ? { message: { type, instanceId } }
            : { error: 'A quest instance is required.' }
    }
    if (type === 'guild_accept' && validGuildQuestId(questId)) {
        const rewardMode = record['rewardMode']
        return rewardMode === undefined || isQuestRewardMode(rewardMode)
            ? {
                  message: {
                      type,
                      questId,
                      ...(rewardMode === undefined ? {} : { rewardMode }),
                  },
              }
            : { error: 'Invalid quest reward mode.' }
    }
    return { error: 'Unknown or invalid command' }
}

function validId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 100
}

function validGuildQuestId(value: unknown): value is string {
    return (
        validId(value) &&
        (['slime_hunt', 'skeleton_hunt', 'survey_frontier'].includes(value) ||
            /^worker-request-[1-9]\d*$/.test(value))
    )
}
