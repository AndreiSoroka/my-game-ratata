import { verifyNpcAiStartup } from './ai/startupProbe'
import { startBackend } from './startBackend'

await startBackend((signal) => verifyNpcAiStartup(Bun.env, Bun.which, signal))
