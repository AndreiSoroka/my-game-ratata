import { parseAgentDecision } from '../game/agentDecisionParsing'
import { parseInformation } from './memoryProtocol'
import { parseSocialReply } from './socialReplyParsing'
import type { NpcAiDiagnostic, NpcAiModelSettings, NpcAiReply } from './types'

export function codexNpcArguments(
    settings: NpcAiModelSettings,
    instructionsPath: string,
    schemaPath: string
): string[] {
    const config = (key: string, value: string | boolean | number) => [
        '-c',
        `${key}=${JSON.stringify(value)}`,
    ]
    const disabled = [
        'shell_tool',
        'unified_exec',
        'multi_agent',
        'apps',
        'plugins',
        'remote_plugin',
        'memories',
        'hooks',
        'view_image',
    ]
    return [
        '-a',
        'never',
        'exec',
        '--ignore-user-config',
        '--ignore-rules',
        '--ephemeral',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--json',
        '--color',
        'never',
        '--output-schema',
        schemaPath,
        '-m',
        settings.model,
        ...disabled.flatMap((feature) => ['--disable', feature]),
        ...config('features.code_mode.enabled', false),
        ...config('web_search', 'disabled'),
        ...config('skills.bundled.enabled', false),
        ...config('skills.include_instructions', false),
        ...config('project_doc_max_bytes', 0),
        ...config('model_reasoning_effort', settings.reasoningEffort),
        ...config('service_tier', settings.serviceTier),
        ...config('model_instructions_file', instructionsPath),
        '-',
    ]
}

export function parseNpcAiReply(input: unknown): NpcAiReply {
    if (!isObject(input)) {
        throw new Error('Invalid NPC AI reply')
    }
    const decision =
        input['decision'] === null
            ? null
            : parseAgentDecision(normalizeProviderDecision(input['decision']))
    if (
        decision === undefined ||
        (decision !== null && !allowedDecisionTypes.has(decision.type))
    ) {
        throw new Error('Invalid NPC AI reply')
    }
    const fields = parseReplyFields(input)
    const diagnostics = parseDiagnostics(input['diagnostics'])
    const social = parseSocialReply(input)
    return {
        decision,
        ...fields,
        ...social,
        ...parseInformation(input),
        ...(diagnostics === undefined ? {} : { diagnostics }),
    }
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
])

const allowedDecisionTypes = new Set([
    'move_to',
    'guide',
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
    'quest_propose',
    'worker_quest_propose',
    'quest_offer_revise',
    'quest_turn_in_request',
    'quest_inquire',
])

export function parseCodexResult(
    stdout: string,
    onUsage: (usage: Record<string, number>) => void = () => undefined
): {
    reply: NpcAiReply
} {
    let finalMessage: string | undefined
    let complete = false
    let usage: Record<string, number> | undefined
    for (const line of stdout
        .split('\n')
        .filter((part) => part.trim() !== '')) {
        const event: unknown = JSON.parse(line)
        if (!isObject(event)) {
            throw new Error('Invalid Codex CLI event')
        }
        if (event['type'] === 'turn.failed' || event['type'] === 'error') {
            throw new Error('Codex CLI failed to complete the turn')
        }
        const message = completedMessage(event)
        if (message !== undefined) {
            finalMessage = message
        }
        if (event['type'] === 'turn.completed') {
            complete = true
            if (isObject(event['usage'])) {
                usage = numericUsage(event['usage'])
            }
        }
    }
    if (!complete || finalMessage === undefined) {
        throw new Error('Codex CLI ended without a completed structured reply')
    }
    if (usage !== undefined) {
        onUsage(usage)
    }
    const reply = parseNpcAiReply(JSON.parse(finalMessage) as unknown)
    return { reply }
}

function completedMessage(event: Record<string, unknown>): string | undefined {
    const item = event['item']
    return event['type'] === 'item.completed' &&
        isObject(item) &&
        item['type'] === 'agent_message' &&
        typeof item['text'] === 'string'
        ? item['text']
        : undefined
}

function numericUsage(input: Record<string, unknown>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(input).filter(
            (entry): entry is [string, number] =>
                typeof entry[1] === 'number' &&
                Number.isFinite(entry[1]) &&
                entry[1] >= 0
        )
    )
}

function isObject(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object' && !Array.isArray(input)
}
