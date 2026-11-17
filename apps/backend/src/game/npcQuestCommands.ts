import type {
    NpcQuestClientMessage,
    NpcQuestDecision,
} from '@my-game-ratata/contracts'
import { isQuestRewardMode } from '@my-game-ratata/contracts'

import { parseQuestDraft } from './npcQuestValidation'

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function id(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 150
}

export function parseNpcQuestCommand(
    value: unknown
): NpcQuestClientMessage | undefined {
    if (!record(value)) {
        return undefined
    }
    if (
        (value['type'] === 'npc_quest_turn_in' ||
            value['type'] === 'npc_quest_abandon') &&
        id(value['instanceId'])
    ) {
        return { type: value['type'], instanceId: value['instanceId'] }
    }
    return parseOfferAnswer(value)
}

function parseOfferAnswer(
    value: Record<string, unknown>
): NpcQuestClientMessage | undefined {
    if (
        value['type'] === 'quest_offer_answer' &&
        id(value['offerId']) &&
        Number.isSafeInteger(value['revision']) &&
        Number(value['revision']) > 0 &&
        typeof value['accept'] === 'boolean' &&
        (value['rewardMode'] === undefined ||
            isQuestRewardMode(value['rewardMode']))
    ) {
        return {
            type: value['type'],
            offerId: value['offerId'],
            revision: Number(value['revision']),
            accept: value['accept'],
            ...(isQuestRewardMode(value['rewardMode'])
                ? { rewardMode: value['rewardMode'] }
                : {}),
        }
    }
    return undefined
}

export function parseNpcQuestDecision(
    value: unknown
): NpcQuestDecision | undefined {
    if (!record(value) || !id(value['targetId'])) {
        return undefined
    }
    if (value['type'] === 'worker_quest_propose' && id(value['requestId'])) {
        return {
            type: value['type'],
            targetId: value['targetId'],
            requestId: value['requestId'],
        }
    }
    if (value['type'] === 'quest_propose') {
        const draft = parseQuestDraft(value['draft'])
        return draft === undefined
            ? undefined
            : { type: value['type'], targetId: value['targetId'], draft }
    }
    return undefined
}
