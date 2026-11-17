import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadNpcAiConfig, parseNpcAiConfig } from '../src/ai/config'

const actors = [
    { actorId: 'npc_friendly_girl_1', role: 'city_coordinator' },
    { actorId: 'npc_magic_slime_1', role: 'companion' },
]

describe('NPC AI configuration', () => {
    it('is opt-in and gives the two authored NPCs explicit economical defaults', async () => {
        const disabled = await loadNpcAiConfig({})
        expect(disabled.enabled).toBe(false)
        expect(disabled.defaults).toEqual({
            cliPath: 'codex',
            model: 'gpt-6-luna',
            reasoningEffort: 'medium',
            serviceTier: 'default',
            timeoutMs: 60_000,
        })
        expect(
            disabled.npcs.map(({ actorId, role }) => ({ actorId, role }))
        ).toEqual(actors)
        expect(
            (await loadNpcAiConfig({ GAME_AI_ENABLED: 'true' })).enabled
        ).toBe(false)
        expect((await loadNpcAiConfig({ GAME_AI_ENABLED: '1' })).enabled).toBe(
            true
        )
    })

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

    it('loads the selected file only when explicitly enabled', async () => {
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
                        GAME_AI_ENABLED: '1',
                        GAME_AI_CONFIG: path,
                    })
                ).defaults.model
            ).toBe('custom-cli-model')
            expect(
                (
                    await loadNpcAiConfig({
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
