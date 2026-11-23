import { ClaudeCliProvider } from './claudeCliProvider'
import { CodexCliProvider } from './codexCliProvider'
import { defaultNpcAiSettings, loadNpcAiConfig } from './config'
import type { NpcAiProbeSchema, NpcCliProvider } from './npcCliProvider'
import type { NpcAiConfig, NpcAiModelSettings, NpcAiProvider } from './types'

export interface ReadyNpcAi {
    config: NpcAiConfig
    provider: NpcAiProvider
    name: string
}

type NpcAiProviderName = 'codex' | 'claude'

const cliProviders = {
    codex: () => new CodexCliProvider(),
    claude: () => new ClaudeCliProvider(),
}

const defaultClaudeSettings: NpcAiModelSettings = {
    ...defaultNpcAiSettings,
    cliPath: 'claude',
    model: 'sonnet',
}

export function npcAiProviderCandidates(
    env: Record<string, string | undefined>
): NpcAiProviderName[] {
    const requested = env['GAME_AI_PROVIDER']
    if (requested === 'codex' || requested === 'claude') {
        return [requested]
    }
    if (requested !== undefined) {
        throw new Error('GAME_AI_PROVIDER must be codex or claude')
    }
    return ['codex', 'claude']
}

export async function loadNpcAiProviderConfig(
    provider: NpcAiProviderName,
    env: Record<string, string | undefined>,
    findExecutable: (command: string) => string | null
): Promise<NpcAiConfig> {
    const config = await loadNpcAiConfig(
        env,
        provider === 'claude' ? defaultClaudeSettings : defaultNpcAiSettings
    )
    const npcs = config.npcs.map((npc) => {
        const cliPath = findExecutable(npc.settings.cliPath)
        if (cliPath === null) {
            throw new Error('NPC AI CLI is unavailable')
        }
        return { ...npc, settings: { ...npc.settings, cliPath } }
    })
    return { ...config, npcs }
}

export async function verifyNpcAiStartup(
    env: Record<string, string | undefined>,
    findExecutable: (command: string) => string | null,
    signal: AbortSignal,
    createProvider: (
        name: NpcAiProviderName
    ) => Pick<NpcCliProvider, 'probe' | 'decide' | 'decideNecromancer'> = (
        name
    ) => cliProviders[name]()
): Promise<ReadyNpcAi> {
    for (const name of npcAiProviderCandidates(env)) {
        signal.throwIfAborted()
        try {
            const config = await loadNpcAiProviderConfig(
                name,
                env,
                findExecutable
            )
            const provider = createProvider(name)
            for (const { schema, settings } of startupProbes(config)) {
                await provider.probe(schema, settings, signal)
            }
            signal.throwIfAborted()
            return { config, provider, name }
        } catch {
            signal.throwIfAborted()
        }
    }
    throw new Error('No configured NPC AI provider passed startup checks')
}

function startupProbes(config: NpcAiConfig) {
    const probes = new Map<
        string,
        {
            schema: NpcAiProbeSchema
            settings: NpcAiModelSettings
        }
    >()
    for (const npc of config.npcs) {
        const schemas: NpcAiProbeSchema[] =
            npc.role === 'necromancer'
                ? ['dialogue', 'necromancer']
                : ['dialogue']
        for (const schema of schemas) {
            const { cliPath, model, serviceTier, reasoningEffort, timeoutMs } =
                npc.settings
            const key = JSON.stringify([
                schema,
                cliPath,
                model,
                serviceTier,
                reasoningEffort,
            ])
            const previous = probes.get(key)
            const timeout = Math.min(
                previous?.settings.timeoutMs ?? timeoutMs,
                timeoutMs
            )
            probes.set(key, {
                schema,
                settings: { ...npc.settings, timeoutMs: timeout },
            })
        }
    }
    return probes.values()
}
