import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import authoredConfig from '../../config/npc-ai.json'
import type { NpcAiActorConfig, NpcAiConfig, NpcAiModelSettings } from './types'

export const defaultNpcAiSettings: NpcAiModelSettings = {
    cliPath: 'codex',
    model: 'gpt-6-luna',
    reasoningEffort: 'medium',
    serviceTier: 'default',
    timeoutMs: 60_000,
}

export const defaultNpcAiLimits: NpcAiConfig['limits'] = {
    maxCallsPerHour: 120,
    maxDecisionsPerTask: 12,
    reviewIntervalMs: 60_000,
    retryDelayMs: 5_000,
}

/** The opt-in flag is deliberately separate from content/configuration files. */
export async function loadNpcAiConfig(
    env: Record<string, string | undefined> = process.env
): Promise<NpcAiConfig> {
    const enabled = env['GAME_AI_ENABLED'] === '1'
    const path = enabled ? env['GAME_AI_CONFIG'] : undefined
    const input: unknown =
        path === undefined
            ? authoredConfig
            : JSON.parse(await readFile(resolve(path), 'utf8'))
    return parseNpcAiConfig(input, enabled)
}

export function parseNpcAiConfig(input: unknown, enabled = false): NpcAiConfig {
    const record = object(input, 'root')
    const defaults = settings(record['defaults'], defaultNpcAiSettings)
    const limits = object(record['limits'] ?? {}, 'limits')
    const rawNpcs = record['npcs']
    if (!Array.isArray(rawNpcs) || rawNpcs.length > 16) {
        throw invalid('npcs must be an array with at most 16 entries')
    }
    const npcs: NpcAiActorConfig[] = rawNpcs.map((raw: unknown) => {
        const npc = object(raw, 'npc')
        const role = npc['role']
        if (
            role !== 'city_coordinator' &&
            role !== 'companion' &&
            role !== 'advisor'
        ) {
            throw invalid(
                'npc.role must be city_coordinator, companion or advisor'
            )
        }
        return {
            actorId: text(npc['actorId'], 'npc.actorId', 100),
            role,
            ...configuredMode(npc, role),
            settings: settings(npc['settings'], defaults),
        }
    })
    if (new Set(npcs.map((npc) => npc.actorId)).size !== npcs.length) {
        throw invalid('npc.actorId must be unique')
    }
    return {
        enabled,
        defaults,
        limits: {
            maxCallsPerHour: integer(
                limits['maxCallsPerHour'] ?? defaultNpcAiLimits.maxCallsPerHour,
                'limits.maxCallsPerHour',
                1,
                10_000
            ),
            maxDecisionsPerTask: integer(
                limits['maxDecisionsPerTask'] ??
                    defaultNpcAiLimits.maxDecisionsPerTask,
                'limits.maxDecisionsPerTask',
                1,
                64
            ),
            reviewIntervalMs: integer(
                limits['reviewIntervalMs'] ??
                    defaultNpcAiLimits.reviewIntervalMs,
                'limits.reviewIntervalMs',
                1_000,
                3_600_000
            ),
            retryDelayMs: integer(
                limits['retryDelayMs'] ?? defaultNpcAiLimits.retryDelayMs,
                'limits.retryDelayMs',
                0,
                300_000
            ),
        },
        npcs,
    }
}

function settings(
    input: unknown,
    fallback: NpcAiModelSettings
): NpcAiModelSettings {
    const record = object(input ?? {}, 'settings')
    const effort = record['reasoningEffort'] ?? fallback.reasoningEffort
    const tier = record['serviceTier'] ?? fallback.serviceTier
    if (!isReasoningEffort(effort)) {
        throw invalid('settings.reasoningEffort is unsupported')
    }
    if (tier !== 'default' && tier !== 'fast') {
        throw invalid('settings.serviceTier must be default or fast')
    }
    return {
        cliPath: text(record['cliPath'] ?? fallback.cliPath, 'cliPath', 1_024),
        model: text(record['model'] ?? fallback.model, 'model', 150),
        reasoningEffort: effort,
        serviceTier: tier,
        timeoutMs: integer(
            record['timeoutMs'] ?? fallback.timeoutMs,
            'settings.timeoutMs',
            1_000,
            300_000
        ),
    }
}

function object(input: unknown, name: string): Record<string, unknown> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw invalid(`${name} must be an object`)
    }
    return input as Record<string, unknown>
}

function text(input: unknown, name: string, maxLength: number): string {
    if (
        typeof input !== 'string' ||
        input.trim().length === 0 ||
        input.length > maxLength ||
        input.includes('\0')
    ) {
        throw invalid(`${name} must be a non-empty string`)
    }
    return input
}

function integer(
    input: unknown,
    name: string,
    min: number,
    max: number
): number {
    if (
        typeof input !== 'number' ||
        !Number.isInteger(input) ||
        input < min ||
        input > max
    ) {
        throw invalid(
            `${name} must be an integer between ${String(min)} and ${String(max)}`
        )
    }
    return input
}

function invalid(message: string): Error {
    return new Error(`Invalid NPC AI configuration: ${message}`)
}

const reasoningEfforts = new Set([
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
    'ultra',
])
function isReasoningEffort(
    input: unknown
): input is NpcAiModelSettings['reasoningEffort'] {
    return typeof input === 'string' && reasoningEfforts.has(input)
}

function configuredMode(
    npc: Record<string, unknown>,
    role: NpcAiActorConfig['role']
): Pick<NpcAiActorConfig, 'mode'> {
    const mode = npc['mode']
    if (
        mode !== undefined &&
        mode !== 'controller' &&
        mode !== 'dialogue_only'
    ) {
        throw invalid('npc.mode must be controller or dialogue_only')
    }
    if (role === 'advisor') {
        return { mode: 'dialogue_only' }
    }
    return mode === undefined ? {} : { mode }
}
