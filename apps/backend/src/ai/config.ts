import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import authoredConfig from '../../config/npc-ai.json'
import { npcAiRoster } from '../game/npcRoster'
import type { NpcAiActorConfig, NpcAiConfig, NpcAiModelSettings } from './types'

export const defaultNpcAiSettings: NpcAiModelSettings = {
    cliPath: 'codex',
    model: 'gpt-6-luna',
    reasoningEffort: 'medium',
    serviceTier: 'default',
    timeoutMs: 60_000,
}

export const defaultNpcAiLimits: NpcAiConfig['limits'] = {
    maxCallsPerMinute: 20,
    maxCallsPer10Minutes: 100,
    maxDecisionsPerTask: 12,
    reviewIntervalMs: 60_000,
    retryDelayMs: 5_000,
}

export async function loadNpcAiConfig(
    env: Record<string, string | undefined> = process.env,
    defaultSettings = defaultNpcAiSettings
): Promise<NpcAiConfig> {
    const path = env['GAME_AI_CONFIG']
    const input: unknown =
        path === undefined
            ? authoredConfig
            : mergeNpcSettings(
                  JSON.parse(await readFile(resolve(path), 'utf8'))
              )
    const config = parseNpcAiConfig(input, true, defaultSettings)
    validateNpcRoster(config)
    return config
}

function mergeNpcSettings(input: unknown): Record<string, unknown> {
    const custom = object(input, 'root')
    const overrides = npcOverrides(custom['npcs'] ?? [])
    return {
        defaults: custom['defaults'],
        limits: {
            ...authoredConfig.limits,
            ...object(custom['limits'] ?? {}, 'limits'),
        },
        npcs: authoredConfig.npcs.map((npc) => ({
            ...npc,
            settings: { ...npc.settings, ...overrides.get(npc.actorId) },
        })),
    }
}

function npcOverrides(
    rawOverrides: unknown
): Map<string, Record<string, unknown>> {
    if (
        !Array.isArray(rawOverrides) ||
        rawOverrides.length > authoredConfig.npcs.length
    ) {
        throw invalid('npcs must list overrides for authored actors')
    }
    const overrides = new Map<string, Record<string, unknown>>()
    for (const input of rawOverrides) {
        const npc = object(input, 'npc')
        const id = text(npc['actorId'], 'npc.actorId', 100)
        const expected = Object.hasOwn(npcAiRoster, id)
            ? npcAiRoster[id]
            : undefined
        if (
            expected === undefined ||
            overrides.has(id) ||
            (npc['role'] !== undefined && npc['role'] !== expected.role) ||
            (npc['mode'] !== undefined && npc['mode'] !== expected.mode)
        ) {
            throw invalid(
                `npc override must match the authored role and mode of ${id}`
            )
        }
        overrides.set(id, object(npc['settings'] ?? {}, 'npc.settings'))
    }
    return overrides
}

function validateNpcRoster(config: NpcAiConfig): void {
    if (
        config.npcs.length !== Object.keys(npcAiRoster).length ||
        config.npcs.some(({ actorId, role, mode }) => {
            const expected = Object.hasOwn(npcAiRoster, actorId)
                ? npcAiRoster[actorId]
                : undefined
            return (
                expected?.role !== role ||
                expected.mode !== (mode ?? 'controller')
            )
        })
    ) {
        throw invalid(
            'bundled NPC AI configuration must match the authored roster'
        )
    }
}

export function parseNpcAiConfig(
    input: unknown,
    enabled?: boolean,
    defaultSettings = defaultNpcAiSettings
): NpcAiConfig {
    const record = object(input, 'root')
    if (
        record['proactive'] !== undefined &&
        typeof record['proactive'] !== 'boolean'
    ) {
        throw invalid('proactive must be a boolean')
    }
    const defaults = settings(record['defaults'], defaultSettings)
    const limits = parseNpcAiLimits(record['limits'] ?? {})
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
            role !== 'advisor' &&
            role !== 'necromancer'
        ) {
            throw invalid(
                'npc.role must be city_coordinator, companion, advisor or necromancer'
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
        enabled: enabled === true,
        proactive: record['proactive'] !== false,
        defaults,
        limits,
        npcs,
    }
}

function parseNpcAiLimits(input: unknown): NpcAiConfig['limits'] {
    const limits = object(input, 'limits')
    const hourlyLimit = limits['maxCallsPerHour']
    return {
        maxCallsPerMinute: integer(
            limits['maxCallsPerMinute'] ?? defaultNpcAiLimits.maxCallsPerMinute,
            'limits.maxCallsPerMinute',
            1,
            10_000
        ),
        maxCallsPer10Minutes: integer(
            limits['maxCallsPer10Minutes'] ??
                defaultNpcAiLimits.maxCallsPer10Minutes,
            'limits.maxCallsPer10Minutes',
            1,
            10_000
        ),
        ...(hourlyLimit == null
            ? {}
            : {
                  maxCallsPerHour: integer(
                      hourlyLimit,
                      'limits.maxCallsPerHour',
                      1,
                      10_000
                  ),
              }),
        maxDecisionsPerTask: integer(
            limits['maxDecisionsPerTask'] ??
                defaultNpcAiLimits.maxDecisionsPerTask,
            'limits.maxDecisionsPerTask',
            1,
            64
        ),
        reviewIntervalMs: integer(
            limits['reviewIntervalMs'] ?? defaultNpcAiLimits.reviewIntervalMs,
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
