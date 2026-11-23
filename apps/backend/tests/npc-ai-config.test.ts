import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadNpcAiConfig, parseNpcAiConfig } from '../src/ai/config'
import {
    loadNpcAiProviderConfig,
    npcAiProviderCandidates,
} from '../src/ai/startupProbe'
import { npcAiRoster } from '../src/game/npcRoster'

const actors = [
    { actorId: 'npc_friendly_girl_1', role: 'city_coordinator' },
    { actorId: 'npc_magic_slime_1', role: 'companion' },
    { actorId: 'npc_cleric_1', role: 'advisor' },
    { actorId: 'npc_necromancer_1', role: 'necromancer' },
]

describe('NPC AI configuration', () => {
    it('configures the complete authored roster with explicit economical defaults', async () => {
        const config = await loadNpcAiConfig({})
        expect(config.enabled).toBe(true)
        expect(config.defaults).toEqual({
            cliPath: 'codex',
            model: 'gpt-6-luna',
            reasoningEffort: 'medium',
            serviceTier: 'default',
            timeoutMs: 60_000,
        })
        expect(
            Object.fromEntries(
                config.npcs.map(({ actorId, role, mode }) => [
                    actorId,
                    { role, mode: mode ?? 'controller' },
                ])
            )
        ).toEqual(npcAiRoster)
        expect(config.npcs).toHaveLength(14)
        expect(npcAiProviderCandidates({})).toEqual(['codex', 'claude'])
        expect(npcAiProviderCandidates({ GAME_AI_PROVIDER: 'claude' })).toEqual(
            ['claude']
        )
        expect(
            npcAiProviderCandidates({ GAME_AI_CONFIG: 'npc-ai.json' })
        ).toEqual(['codex', 'claude'])
        expect(() =>
            npcAiProviderCandidates({ GAME_AI_PROVIDER: 'unknown' })
        ).toThrow('GAME_AI_PROVIDER must be codex or claude')
    })
})

describe('NPC AI startup', () => {
    it('resolves a provider for the whole roster and rejects missing executables', async () => {
        const onlyClaude = (name: string) =>
            name === 'claude' ? '/bin/claude' : null
        const config = await loadNpcAiProviderConfig('claude', {}, onlyClaude)
        expect(config.npcs).toHaveLength(14)
        expect(
            config.npcs.every(
                ({ settings }) =>
                    settings.cliPath === '/bin/claude' &&
                    settings.model === 'sonnet'
            )
        ).toBe(true)
        await expect(
            loadNpcAiProviderConfig('codex', {}, onlyClaude)
        ).rejects.toThrow('unavailable')
    })
})

describe('NPC AI model settings', () => {
    it('merges per-NPC settings without changing the other character', () => {
        const config = parseNpcAiConfig(
            {
                defaults: { model: 'test-model', reasoningEffort: 'medium' },
                npcs: [
                    actors[0],
                    {
                        ...actors[1],
                        settings: {
                            model: 'another-model',
                            timeoutMs: 10_000,
                            serviceTier: 'fast',
                        },
                    },
                ],
            },
            true
        )
        expect(config.npcs[0]?.settings).toMatchObject({
            model: 'test-model',
            reasoningEffort: 'medium',
            timeoutMs: 60_000,
            serviceTier: 'default',
        })
        expect(config.npcs[1]?.settings).toMatchObject({
            model: 'another-model',
            reasoningEffort: 'medium',
            timeoutMs: 10_000,
            serviceTier: 'fast',
        })
        expect(config.limits).toEqual({
            maxCallsPerHour: 120,
            maxDecisionsPerTask: 12,
            reviewIntervalMs: 60_000,
            retryDelayMs: 5_000,
        })
    })

    it('loads the selected file as settings overrides for the full roster', async () => {
        const directory = await mkdtemp(
            join(tmpdir(), 'ratata-ai-config-test-')
        )
        try {
            const path = join(directory, 'npc-ai.json')
            await writeFile(
                path,
                JSON.stringify({
                    defaults: { model: 'custom-cli-model' },
                    npcs: actors,
                })
            )
            expect(
                (
                    await loadNpcAiConfig({
                        GAME_AI_CONFIG: path,
                    })
                ).defaults.model
            ).toBe('custom-cli-model')
            const startup = await loadNpcAiProviderConfig(
                'claude',
                { GAME_AI_CONFIG: path },
                (name) => `/bin/${name}`
            )
            expect(startup.npcs[0]?.settings).toMatchObject({
                cliPath: '/bin/claude',
                model: 'custom-cli-model',
            })
            expect(startup.npcs).toHaveLength(14)
            await writeFile(
                path,
                JSON.stringify({ npcs: [{ ...actors[0], role: 'advisor' }] })
            )
            await expect(
                loadNpcAiConfig({ GAME_AI_CONFIG: path })
            ).rejects.toThrow('authored role and mode')
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })

    it.each([
        { defaults: { model: '' }, npcs: actors },
        { defaults: { reasoningEffort: 'invented' }, npcs: actors },
        { defaults: { timeoutMs: -1 }, npcs: actors },
        { defaults: { serviceTier: 'unlimited' }, npcs: actors },
        { limits: { maxCallsPerHour: 0 }, npcs: actors },
        { limits: { maxDecisionsPerTask: 3.5 }, npcs: actors },
        { npcs: [actors[0], actors[0]] },
        { npcs: [{ actorId: 'npc', role: 'administrator' }] },
    ])('rejects invalid settings before starting a process: %j', (input) => {
        expect(() => parseNpcAiConfig(input, true)).toThrow(
            'Invalid NPC AI configuration'
        )
    })
})
