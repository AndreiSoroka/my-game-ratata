import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { loadNpcAiConfig } from '../src/ai/config'
import { type ReadyNpcAi, verifyNpcAiStartup } from '../src/ai/startupProbe'
import { GameStartup } from '../src/gameStartup'
import { createFetchHandler } from '../src/server'

const findExecutable = (path: string) => `/bin/${path}`
const provider = {
    decide() {
        return Promise.reject(new Error('Only used for startup'))
    },
    decideNecromancer() {
        return Promise.reject(new Error('Only used for startup'))
    },
}

describe('mandatory NPC AI startup', () => {
    it.each([
        { config: 'bundled', env: {} },
        {
            config: 'external',
            env: {
                GAME_AI_CONFIG: fileURLToPath(
                    new URL('../config/npc-ai.json', import.meta.url)
                ),
            },
        },
    ])(
        'rechecks both schemas on Claude after Codex fails with $config settings',
        async ({ env }) => {
            const calls: string[] = []
            const signal = new AbortController().signal
            const ready = await verifyNpcAiStartup(
                env,
                findExecutable,
                signal,
                (name) => ({
                    ...provider,
                    probe(schema, settings, actualSignal) {
                        expect(actualSignal).toBe(signal)
                        expect(settings.cliPath).toBe(`/bin/${name}`)
                        calls.push(`${name}:${schema}`)
                        if (name === 'codex' && schema === 'necromancer') {
                            return Promise.reject(
                                new Error('Malformed tactics')
                            )
                        }
                        return Promise.resolve()
                    },
                })
            )
            expect(calls).toEqual([
                'codex:dialogue',
                'codex:dialogue',
                'codex:necromancer',
                'claude:dialogue',
                'claude:dialogue',
                'claude:necromancer',
            ])
            expect(ready.name).toBe('claude')
            expect(
                ready.config.npcs.every(
                    ({ settings }) => settings.cliPath === '/bin/claude'
                )
            ).toBe(true)
        }
    )

    it('does not replace an explicit provider or start if its CLI is absent', async () => {
        const createProvider = vi.fn<
            Parameters<typeof verifyNpcAiStartup>[3] & {}
        >()
        await expect(
            verifyNpcAiStartup(
                { GAME_AI_PROVIDER: 'codex' },
                (name) => (name === 'claude' ? '/bin/claude' : null),
                new AbortController().signal,
                createProvider
            )
        ).rejects.toThrow('passed startup checks')
        expect(createProvider).not.toHaveBeenCalled()
    })
})

describe('world readiness', () => {
    it('exposes waiting and failure to cross-port browsers, then starts exactly one room with the chosen mode', async () => {
        const retry = Promise.withResolvers<undefined>()
        const ready: ReadyNpcAi = {
            config: await loadNpcAiConfig({}),
            provider,
            name: 'fixture',
        }
        const prepare = vi
            .fn<() => Promise<ReadyNpcAi>>()
            .mockRejectedValueOnce(new Error('Probe failed'))
            .mockResolvedValueOnce(ready)
        const room = {
            start: vi.fn(),
            stop: vi.fn(),
            setEmptyWorldMode: vi.fn(),
        }
        const createRoom = vi.fn(() => room)
        const startup = new GameStartup(
            prepare,
            createRoom,
            () => retry.promise
        )
        const fetch = createFetchHandler(undefined, {
            readiness: () => startup.readiness,
        })
        const request = () =>
            new Request('http://127.0.0.1:3500/ready', {
                headers: { Origin: 'http://127.0.0.1:5500' },
            })
        const checking = await fetch(request())
        expect(checking?.status).toBe(503)
        expect(await checking?.json()).toEqual({ state: 'checking' })

        const started = startup.start()
        await vi.waitFor(() => expect(startup.readiness).toBe('ai_unavailable'))
        expect(createRoom).not.toHaveBeenCalled()
        const failed = await fetch(request())
        expect(failed?.status).toBe(503)
        expect(failed?.headers.get('Access-Control-Allow-Origin')).toBe('*')
        expect(await failed?.json()).toEqual({ state: 'ai_unavailable' })
        const blocked = await fetch(new Request('http://127.0.0.1:3500/ws'))
        expect(blocked?.status).toBe(503)

        startup.setWorldMode('paused_when_empty')
        retry.resolve(undefined)
        await started
        await startup.start()
        expect(createRoom).toHaveBeenCalledExactlyOnceWith(
            ready,
            'paused_when_empty'
        )
        expect(room.start).toHaveBeenCalledTimes(1)
        expect((await fetch(request()))?.status).toBe(200)
        startup.setWorldMode('always')
        expect(room.setEmptyWorldMode).toHaveBeenCalledExactlyOnceWith('always')
        startup.stop()
        expect(room.stop).toHaveBeenCalledTimes(1)
    })
})
