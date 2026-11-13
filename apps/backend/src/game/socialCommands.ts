import type { ParseResult } from './messages'

export function parseSocialCommand(
    record: Record<string, unknown>
): ParseResult {
    const type = record['type']
    const targetId = record['targetId']
    const invitationId = record['invitationId']
    const accept = record['accept']
    const questId = record['questId']
    if (type === 'party_leave' || type === 'guild_turn_in') {
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
    if (
        type === 'guild_accept' &&
        (questId === 'slime_hunt' ||
            questId === 'skeleton_hunt' ||
            questId === 'survey_frontier')
    ) {
        return { message: { type, questId } }
    }
    return { error: 'Unknown or invalid command' }
}

function validId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 100
}
