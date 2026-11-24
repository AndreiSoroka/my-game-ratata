import { isBladeAbility } from '@my-game-ratata/contracts'

import { parseAgentDecision } from '../game/agentDecisionParsing'
import { type NpcServiceOffer, npcServiceOffers } from '../game/npcRoster'
import { parseInformation } from './memoryProtocol'
import { parseSocialReply } from './socialReplyParsing'
import type { NpcAiDiagnostic, NpcAiReply } from './types'

export function parseNpcAiReply(input: unknown): NpcAiReply {
    if (!isObject(input)) {
        throw new Error('Invalid NPC AI reply')
    }
    const decision =
        input['decision'] === null
            ? null
            : parseNpcDecision(normalizeProviderDecision(input['decision']))
    if (
        decision === undefined ||
        (decision?.type === 'use_ability' &&
            !isBladeAbility(decision.abilityId) &&
            decision.abilityId !== 'shot') ||
        (decision !== null && !allowedDecisionTypes.has(decision.type))
    ) {
        throw new Error('Invalid NPC AI reply')
    }
    const fields = parseReplyFields(input)
    const diagnostics = parseDiagnostics(input['diagnostics'])
    const social = parseSocialReply(input)
    const offerService = parseServiceOffer(input['offerService'])
    return {
        decision,
        ...fields,
        ...social,
        ...parseInformation(input),
        ...(offerService === undefined ? {} : { offerService }),
        ...(diagnostics === undefined ? {} : { diagnostics }),
    }
}

function parseNpcDecision(input: unknown): NpcAiReply['decision'] | undefined {
    if (isObject(input)) {
        switch (input['type']) {
            case 'travel_to':
                return validDecisionId(input['targetKey']) &&
                    typeof input['inviteEscort'] === 'boolean'
                    ? {
                          type: 'travel_to',
                          targetKey: input['targetKey'],
                          inviteEscort: input['inviteEscort'],
                      }
                    : undefined
            case 'leave_companion':
                return { type: 'leave_companion' }
            case 'propose_follow':
            case 'start_following':
                return validDecisionId(input['targetId'])
                    ? { type: input['type'], targetId: input['targetId'] }
                    : undefined
        }
    }
    return parseAgentDecision(input)
}

function validDecisionId(input: unknown): input is string {
    return (
        typeof input === 'string' &&
        input.trim().length > 0 &&
        input.length <= 100
    )
}

function parseServiceOffer(input: unknown): NpcServiceOffer | null | undefined {
    if (input === undefined || input === null) {
        return input
    }
    const service = npcServiceOffers.find((candidate) => candidate === input)
    if (service === undefined) {
        throw new Error('Invalid NPC AI service offer')
    }
    return service
}

/** Strict model schemas represent an absent optional replacement as null. */
function normalizeProviderDecision(input: unknown): unknown {
    if (
        !isObject(input) ||
        !['quest_propose', 'worker_quest_propose'].includes(
            String(input['type'])
        ) ||
        input['replaceOffer'] !== null
    ) {
        return input
    }
    const normalized = { ...input }
    delete normalized['replaceOffer']
    return normalized
}

function parseReplyFields(input: Record<string, unknown>): {
    memory: string
    done: boolean
    waitMs: number
} {
    if (
        Object.keys(input).some((key) => !replyFields.has(key)) ||
        typeof input['memory'] !== 'string' ||
        input['memory'].length > 2_000 ||
        typeof input['done'] !== 'boolean' ||
        typeof input['waitMs'] !== 'number' ||
        !Number.isInteger(input['waitMs']) ||
        input['waitMs'] < 0 ||
        input['waitMs'] > 300_000
    ) {
        throw new Error('Invalid NPC AI reply')
    }
    return {
        memory: input['memory'],
        done: input['done'],
        waitMs: input['waitMs'],
    }
}

function parseDiagnostics(input: unknown): NpcAiDiagnostic[] | undefined {
    if (input === undefined) {
        return undefined
    }
    if (!Array.isArray(input) || input.length > 4) {
        throw new Error('Invalid NPC AI diagnostics')
    }
    return input.map((raw: unknown) => {
        if (!isObject(raw)) {
            throw new Error('Invalid NPC AI diagnostic')
        }
        const kind = raw['kind']
        if (
            kind !== 'missing_capability' &&
            kind !== 'blocked' &&
            kind !== 'uncertain'
        ) {
            throw new Error('Invalid NPC AI diagnostic kind')
        }
        return {
            kind,
            capability: diagnosticText(raw['capability'], 100),
            detail: diagnosticText(raw['detail'], 400),
            attempted: diagnosticText(raw['attempted'], 400),
        }
    })
}

function diagnosticText(input: unknown, maxLength: number): string {
    if (typeof input !== 'string' || input.length > maxLength) {
        throw new Error('Invalid NPC AI diagnostic text')
    }
    return input
}

const replyFields = new Set([
    'decision',
    'memory',
    'done',
    'waitMs',
    'diagnostics',
    'speech',
    'taskAcceptance',
    'companionOrder',
    'waitMode',
    'informationRequest',
    'personMemoryUpdate',
    'offerService',
])

const allowedDecisionTypes = new Set([
    'move_to',
    'use_ability',
    'guide',
    'travel_to',
    'leave_companion',
    'propose_follow',
    'start_following',
    'attack',
    'interact',
    'dialogue_choice',
    'speak',
    'follow',
    'wait',
    'cancel_control',
    'exchange_invite',
    'exchange_answer',
    'exchange_offer',
    'exchange_accept',
    'exchange_cancel',
    'exchange_decline',
    'quest_board_publish',
    'quest_propose',
    'worker_quest_propose',
    'quest_invitation_answer',
    'quest_offer_revise',
    'quest_turn_in_request',
    'quest_inquire',
])

export function numericUsage(
    input: Record<string, unknown>
): Record<string, number> {
    return Object.fromEntries(
        Object.entries(input).filter(
            (entry): entry is [string, number] =>
                typeof entry[1] === 'number' &&
                Number.isFinite(entry[1]) &&
                entry[1] >= 0
        )
    )
}

export function isObject(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
}
