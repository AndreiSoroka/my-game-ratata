import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
    loadNpcAiConfig,
    loadNpcAiStartupConfig,
    parseNpcAiConfig,
} from '../src/ai/config'

const actors = [
    { actorId: 'npc_friendly_girl_1', role: 'city_coordinator' },
    { actorId: 'npc_magic_slime_1', role: 'companion' },
    { actorId: 'npc_cleric_1', role: 'advisor' },
    { actorId: 'npc_necromancer_1', role: 'necromancer' },
]

describe('NPC AI configuration', () => {
    it('is enabled by default and gives the authored NPCs explicit economical defaults', async () => {
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
            config.npcs.map(({ actorId, role }) => ({ actorId, role }))
        ).toEqual(actors)
        expect((await loadNpcAiConfig({ GAME_AI_ENABLED: '0' })).enabled).toBe(
            false
        )
        expect(
            (await loadNpcAiConfig({ GAME_AI_ENABLED: 'true' })).enabled
        ).toBe(false)
        expect((await loadNpcAiConfig({ GAME_AI_ENABLED: '1' })).enabled).toBe(
            true
        )
    })
})

describe('NPC AI startup', () => {
    it('prefers Codex when both executable names resolve', async () => {
        const ai = await loadNpcAiStartupConfig({}, (name) => `/bin/${name}`)
        expect(ai?.provider).toBe('codex')
        expect(ai?.config.npcs).toHaveLength(actors.length)
        expect(ai?.config.npcs[0]?.settings).toMatchObject({
            cliPath: '/bin/codex',
            model: 'gpt-6-luna',
        })
    })

    it('uses Claude when it is the only installed CLI or is explicitly selected', async () => {
        const onlyClaude = (name: string) =>
            name === 'claude' ? '/bin/claude' : null
        for (const ai of [
            await loadNpcAiStartupConfig({}, onlyClaude),
            await loadNpcAiStartupConfig(
                { GAME_AI_PROVIDER: 'claude' },
                (name) => `/bin/${name}`
            ),
        ]) {
            expect(ai?.provider).toBe('claude')
            expect(ai?.config.npcs).toHaveLength(actors.length)
            expect(ai?.config.npcs[0]?.settings).toMatchObject({
                cliPath: '/bin/claude',
                model: 'sonnet',
            })
        }
        const unavailable = await loadNpcAiStartupConfig(
            { GAME_AI_PROVIDER: 'codex' },
            onlyClaude
        )
        expect(unavailable?.config.npcs).toEqual([])
    })

    it('starts without model-controlled NPCs when no CLI is installed or AI is disabled', async () => {
        const unavailable = await loadNpcAiStartupConfig({}, () => null)
        expect(unavailable?.config.npcs).toEqual([])
        await expect(
            loadNpcAiStartupConfig({ GAME_AI_ENABLED: '0' }, () => {
                throw new Error('should not look up a CLI when disabled')
            })
        ).resolves.toBeUndefined()
        await expect(
            loadNpcAiStartupConfig({ GAME_AI_PROVIDER: 'unknown' }, () => null)
        ).rejects.toThrow('GAME_AI_PROVIDER must be codex or claude')
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

    it('loads the selected file by default and ignores it when disabled', async () => {
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
            const startup = await loadNpcAiStartupConfig(
                { GAME_AI_CONFIG: path, GAME_AI_PROVIDER: 'claude' },
                (name) => `/bin/${name}`
            )
            expect(startup?.config.npcs[0]?.settings).toMatchObject({
                cliPath: '/bin/claude',
                model: 'custom-cli-model',
            })
            expect(
                (
                    await loadNpcAiConfig({
                        GAME_AI_ENABLED: '0',
                        GAME_AI_CONFIG: join(directory, 'missing.json'),
                    })
                ).enabled
            ).toBe(false)
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
