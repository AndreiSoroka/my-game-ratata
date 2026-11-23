import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { codexNpcArguments, parseCodexOutput } from './codexCliProtocol'
import { cliEnvironment } from './npcCliProcess'
import { NpcCliProvider, type NpcCliProviderOptions } from './npcCliProvider'

export { codexNpcArguments, parseNpcAiReply } from './codexCliProtocol'
export type { NpcAiProcess, NpcAiSpawn } from './npcCliProcess'
export type { NpcAiTelemetry } from './npcCliProvider'

export class CodexCliProvider extends NpcCliProvider {
    public constructor(options: NpcCliProviderOptions = {}) {
        super(
            {
                environment: () =>
                    cliEnvironment([
                        'CODEX_HOME',
                        'OPENAI_API_KEY',
                        'CODEX_API_KEY',
                    ]),
                async arguments(settings, instructionsPath, schemaJson) {
                    const schemaPath = join(
                        dirname(instructionsPath),
                        'decision-schema.json'
                    )
                    await writeFile(schemaPath, schemaJson)
                    return codexNpcArguments(
                        settings,
                        instructionsPath,
                        schemaPath
                    )
                },
                parse: parseCodexOutput,
                exitReason,
            },
            options
        )
    }
}

function exitReason(stderr: string): string {
    if (/not logged in|login|authentication|unauthorized/i.test(stderr)) {
        return 'Codex CLI authentication is unavailable; run codex login'
    }
    if (/model.*(not.*support|not.*available|not.*found)/i.test(stderr)) {
        return 'The configured Codex CLI model is unavailable'
    }
    if (/rate.?limit|quota|usage limit/i.test(stderr)) {
        return 'Codex CLI usage limit reached'
    }
    return 'Codex CLI exited unsuccessfully'
}
