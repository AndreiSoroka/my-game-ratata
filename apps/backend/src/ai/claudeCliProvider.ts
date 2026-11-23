import { cliEnvironment } from './npcCliProcess'
import { isObject, numericUsage } from './npcCliProtocol'
import { NpcCliProvider, type NpcCliProviderOptions } from './npcCliProvider'
import type { NpcAiModelSettings } from './types'

// Claude's structured-output grammar limits complex unions and constraints.
const replyEnvelopeSchema = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    required: ['replyJson'],
    properties: { replyJson: { type: 'string' } },
})

export class ClaudeCliProvider extends NpcCliProvider {
    public constructor(options: NpcCliProviderOptions = {}) {
        super(
            {
                environment: () => ({
                    ...cliEnvironment([
                        'CLAUDE_CONFIG_DIR',
                        'ANTHROPIC_API_KEY',
                        'ANTHROPIC_AUTH_TOKEN',
                        'CLAUDE_CODE_OAUTH_TOKEN',
                    ]),
                    ENABLE_TOOL_SEARCH: 'false',
                    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
                    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
                }),
                instructionSuffix: (schema) =>
                    `Return the complete NPC reply as JSON text in the structured output field replyJson. The decoded reply must match this schema:\n${schema}`,
                arguments: claudeNpcArguments,
                parse: parseClaudeResult,
                exitReason,
            },
            options
        )
    }
}

function claudeNpcArguments(
    settings: NpcAiModelSettings,
    instructionsPath: string
): string[] {
    return [
        '--print',
        '--safe-mode',
        '--restricted',
        '--tools',
        '',
        '--permission-prompts',
        'none',
        '--strict-mcp-config',
        '--mcp-config',
        '{"mcpServers":{}}',
        '--disable-slash-commands',
        '--no-chrome',
        '--no-session-persistence',
        '--max-turns',
        '1',
        '--output-format',
        'json',
        '--json-schema',
        replyEnvelopeSchema,
        '--system-prompt-file',
        instructionsPath,
        '--model',
        settings.model,
        '--effort',
        settings.reasoningEffort === 'ultra' ? 'max' : settings.reasoningEffort,
    ]
}

function parseClaudeResult(
    stdout: string,
    onUsage: (usage: Record<string, number>) => void
): unknown {
    const result = parseJson(stdout)
    if (!isObject(result)) {
        throw new Error('Invalid Claude Code CLI result')
    }
    if (isObject(result['usage'])) {
        onUsage(numericUsage(result['usage']))
    }
    const envelope = result['structured_output']
    if (
        result['type'] !== 'result' ||
        result['subtype'] !== 'success' ||
        result['is_error'] !== false ||
        !isObject(envelope) ||
        typeof envelope['replyJson'] !== 'string'
    ) {
        throw new Error(
            'Claude Code CLI ended without a completed structured reply'
        )
    }
    return parseJson(envelope['replyJson'])
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text)
    } catch {
        throw new Error('Invalid Claude Code CLI result')
    }
}

function exitReason(stderr: string, stdout: string): string {
    const output = `${stderr}\n${stdout}`
    if (
        /not logged in|login|authentication|unauthorized|invalid api key/i.test(
            output
        )
    ) {
        return 'Claude Code CLI authentication is unavailable; run claude auth login'
    }
    if (/model.*(not.*support|not.*available|not.*found)/i.test(output)) {
        return 'The configured Claude Code CLI model is unavailable'
    }
    if (/rate.?limit|quota|usage limit/i.test(output)) {
        return 'Claude Code CLI usage limit reached'
    }
    return 'Claude Code CLI exited unsuccessfully'
}
