import type {
    AgentDecision,
    ClientMessage,
    NpcQuestClientMessage,
    NpcQuestDecision,
    QuestOfferReplacement,
} from '@my-game-ratata/contracts'
import { isQuestRewardMode } from '@my-game-ratata/contracts'

import { parseQuestDraft } from './npcQuestValidation'

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function id(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 150
}
function integer(value: unknown, min: number, max: number): boolean {
    return (
        Number.isSafeInteger(value) &&
        Number(value) >= min &&
        Number(value) <= max
    )
}

export function parseNpcQuestCommand(
    value: unknown
): NpcQuestClientMessage | undefined {
    if (!record(value)) {
        return undefined
    }
    switch (value['type']) {
        case 'quest_turn_in_confirm':
            return parseConfirmation(value)
        case 'quest_inquire':
            return parseInquiry(value)
        case 'npc_quest_turn_in':
        case 'npc_quest_abandon':
            return id(value['instanceId'])
                ? { type: value['type'], instanceId: value['instanceId'] }
                : undefined
        default:
            return parseOfferAnswer(value)
    }
}
function parseConfirmation(
    value: Record<string, unknown>
): NpcQuestClientMessage | undefined {
    return id(value['confirmationId']) && typeof value['accept'] === 'boolean'
        ? {
              type: 'quest_turn_in_confirm',
              confirmationId: value['confirmationId'],
              accept: value['accept'],
          }
        : undefined
}
function parseInquiry(
    value: Record<string, unknown>
): Extract<NpcQuestClientMessage, { type: 'quest_inquire' }> | undefined {
    return id(value['instanceId']) && integer(value['objectiveIndex'], 0, 3)
        ? {
              type: 'quest_inquire',
              instanceId: value['instanceId'],
              objectiveIndex: Number(value['objectiveIndex']),
          }
        : undefined
}
function parseOfferAnswer(
    value: Record<string, unknown>
): NpcQuestClientMessage | undefined {
    if (
        value['type'] !== 'quest_offer_answer' ||
        !id(value['offerId']) ||
        !integer(value['revision'], 1, Number.MAX_SAFE_INTEGER) ||
        typeof value['accept'] !== 'boolean' ||
        (value['rewardMode'] !== undefined &&
            !isQuestRewardMode(value['rewardMode']))
    ) {
        return undefined
    }
    return {
        type: 'quest_offer_answer',
        offerId: value['offerId'],
        revision: Number(value['revision']),
        accept: value['accept'],
        ...(isQuestRewardMode(value['rewardMode'])
            ? { rewardMode: value['rewardMode'] }
            : {}),
    }
}

export function parseNpcQuestDecision(
    value: unknown
): NpcQuestDecision | undefined {
    if (!record(value)) {
        return undefined
    }
    if (value['type'] === 'quest_inquire') {
        return parseInquiry(value)
    }
    const targetId = value['targetId']
    if (!id(targetId)) {
        return undefined
    }
    switch (value['type']) {
        case 'quest_invitation_answer':
            return id(value['invitationId']) &&
                typeof value['show'] === 'boolean'
                ? {
                      type: value['type'],
                      targetId,
                      invitationId: value['invitationId'],
                      show: value['show'],
                  }
                : undefined
        case 'quest_turn_in_request':
            return id(value['instanceId'])
                ? {
                      type: value['type'],
                      targetId,
                      instanceId: value['instanceId'],
                  }
                : undefined
        case 'quest_offer_revise':
            return parseRevision(value, targetId)
        case 'worker_quest_propose':
            return parseWorkerProposal(value, targetId)
        case 'quest_propose':
            return parseDraftProposal(value, targetId)
        default:
            return undefined
    }
}

function parseWorkerProposal(
    value: Record<string, unknown>,
    targetId: string
): NpcQuestDecision | undefined {
    const replaceOffer = parseReplacement(value['replaceOffer'])
    return id(value['requestId']) && replaceOffer !== null
        ? {
              type: 'worker_quest_propose',
              targetId,
              requestId: value['requestId'],
              ...(replaceOffer === undefined ? {} : { replaceOffer }),
          }
        : undefined
}

function parseDraftProposal(
    value: Record<string, unknown>,
    targetId: string
): NpcQuestDecision | undefined {
    const draft = parseQuestDraft(value['draft'])
    const replaceOffer = parseReplacement(value['replaceOffer'])
    return draft === undefined || replaceOffer === null
        ? undefined
        : {
              type: 'quest_propose',
              targetId,
              draft,
              ...(replaceOffer === undefined ? {} : { replaceOffer }),
          }
}

function parseReplacement(
    value: unknown
): QuestOfferReplacement | null | undefined {
    if (value === undefined) {
        return undefined
    }
    if (
        !record(value) ||
        Object.keys(value).some(
            (key) => !['offerId', 'revision'].includes(key)
        ) ||
        !id(value['offerId']) ||
        !integer(value['revision'], 1, Number.MAX_SAFE_INTEGER)
    ) {
        return null
    }
    return {
        offerId: value['offerId'],
        revision: Number(value['revision']),
    }
}

function parseRevision(
    value: Record<string, unknown>,
    targetId: string
): NpcQuestDecision | undefined {
    const items = parseRewards(value['rewardItems'])
    if (
        !id(value['offerId']) ||
        !integer(value['revision'], 1, Number.MAX_SAFE_INTEGER) ||
        !integer(value['rewardGold'], 0, 300) ||
        items === undefined
    ) {
        return undefined
    }
    return {
        type: 'quest_offer_revise',
        targetId,
        offerId: value['offerId'],
        revision: Number(value['revision']),
        rewardGold: Number(value['rewardGold']),
        rewardItems: items,
    }
}
function parseRewards(
    value: unknown
): Array<{ instanceId: string; quantity: number }> | undefined {
    if (!Array.isArray(value) || value.length > 10) {
        return undefined
    }
    const items: Array<{ instanceId: string; quantity: number }> = []
    const entries: unknown[] = value
    for (const item of entries) {
        if (
            !record(item) ||
            !id(item['instanceId']) ||
            !integer(item['quantity'], 1, 100)
        ) {
            return undefined
        }
        items.push({
            instanceId: item['instanceId'],
            quantity: Number(item['quantity']),
        })
    }
    return new Set(items.map((item) => item.instanceId)).size === items.length
        ? items
        : undefined
}

export function isNpcQuestClient(
    message: ClientMessage
): message is Exclude<
    NpcQuestClientMessage,
    { type: 'quest_turn_in_confirm' }
> {
    return [
        'quest_offer_answer',
        'npc_quest_turn_in',
        'npc_quest_abandon',
        'quest_inquire',
    ].includes(message.type)
}
export function isNpcQuestDecision(
    decision: AgentDecision
): decision is NpcQuestDecision {
    return [
        'quest_propose',
        'quest_invitation_answer',
        'worker_quest_propose',
        'quest_offer_revise',
        'quest_turn_in_request',
        'quest_inquire',
    ].includes(decision.type)
}
