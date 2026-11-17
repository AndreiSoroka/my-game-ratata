import { knowledgeCorpus } from './ai/knowledgeCorpus'
import { GameRoom } from './game/room'
import { createFetchHandler, createWebSocketHandlers } from './server'

const defaultPort = 3000
const rawPort = Bun.env['PORT']
const port = Number(rawPort ?? String(defaultPort))

if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort ?? String(defaultPort)}`)
}

knowledgeCorpus()
const aiConfig = await loadNpcAiConfig()
const room = new GameRoom(undefined, {
    ...(Bun.env['GAME_NPC_SPEECH_SEED'] === undefined
        ? {}
        : { npcSpeechSeed: Bun.env['GAME_NPC_SPEECH_SEED'] }),
    ...(aiConfig.enabled
        ? { ai: { config: aiConfig, provider: new CodexCliProvider() } }
        : {}),
})
room.start()

const server = Bun.serve({
    fetch: createFetchHandler(room),
    port,
    websocket: createWebSocketHandlers(room),
})

const hostname = server.hostname ?? 'localhost'
const servedPort = server.port ?? port

console.info(`Backend listening on http://${hostname}:${String(servedPort)}`)
console.info(`Game room ready with map ${room.navigation.summary.id}`)
import { CodexCliProvider } from './ai/codexCliProvider'
import { loadNpcAiConfig } from './ai/config'
if (aiConfig.enabled) {
    console.info(
        `NPC AI enabled for ${aiConfig.npcs.map((npc) => `${npc.actorId}: ${npc.settings.model} (${npc.settings.reasoningEffort})`).join(', ')}`
    )
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        room.stop()
        void server.stop(true)
    })
}
