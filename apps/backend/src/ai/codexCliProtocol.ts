import { isObject, numericUsage, parseNpcAiReply } from './npcCliProtocol'
import type { NpcAiModelSettings, NpcAiReply } from './types'

export { parseNpcAiReply } from './npcCliProtocol'

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

export function parseCodexResult(
    stdout: string,
    onUsage: (usage: Record<string, number>) => void = () => undefined
): {
    reply: NpcAiReply
} {
    return { reply: parseNpcAiReply(parseCodexOutput(stdout, onUsage)) }
}

export function parseCodexOutput(
    stdout: string,
    onUsage: (usage: Record<string, number>) => void
): unknown {
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
    return JSON.parse(finalMessage) as unknown
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
