import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { ClaudeCliProvider } from './ai/claudeCliProvider'
import { CodexCliProvider } from './ai/codexCliProvider'
import { loadNpcAiStartupConfig } from './ai/config'
import { knowledgeCorpus } from './ai/knowledgeCorpus'
import { GameRoom } from './game/room'
import { WorldMaps } from './game/worldMaps'
import { createFetchHandler, createWebSocketHandlers } from './server'

const defaultPort = 3000
const rawPort = Bun.env['PORT']
const port = Number(rawPort ?? String(defaultPort))

if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${rawPort ?? String(defaultPort)}`)
}

knowledgeCorpus()
const ai = await loadNpcAiStartupConfig(Bun.env, Bun.which)
const aiAvailable = ai !== undefined && ai.config.npcs.length > 0
const worldMaps = new WorldMaps({
    ...(Bun.env['GAME_WORLD_SEED'] === undefined
        ? {}
        : { seed: Bun.env['GAME_WORLD_SEED'] }),
})
const room = new GameRoom(worldMaps.navigation(CENTER_LOCATION_ID), {
    worldMaps,
    worldSeed: worldMaps.seed,
    ...(Bun.env['GAME_NPC_IDENTITY_SEED'] === undefined
        ? {}
        : { npcIdentitySeed: Bun.env['GAME_NPC_IDENTITY_SEED'] }),
    ...(Bun.env['GAME_NPC_SPEECH_SEED'] === undefined
        ? {}
        : { npcSpeechSeed: Bun.env['GAME_NPC_SPEECH_SEED'] }),
    ...(aiAvailable
        ? {
              ai: {
                  config: ai.config,
                  provider:
                      ai.provider === 'claude'
                          ? new ClaudeCliProvider()
                          : new CodexCliProvider(),
              },
          }
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
if (aiAvailable) {
    console.info(
        `NPC AI configured via ${ai.provider} for ${ai.config.npcs.map((npc) => `${npc.actorId}: ${npc.settings.model}`).join(', ')}`
    )
} else if (ai !== undefined) {
    console.warn(
        'NPC AI has no configured NPC with an available CLI; using scripted behavior'
    )
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        room.stop()
        void server.stop(true)
    })
}
