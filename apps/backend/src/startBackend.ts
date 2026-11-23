import { isIP } from 'node:net'

import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'

import { knowledgeCorpus } from './ai/knowledgeCorpus'
import type { ReadyNpcAi } from './ai/startupProbe'
import { LocalSpeechTranslator } from './game/localSpeechTranslator'
import { GameRoom } from './game/room'
import { WorldMaps } from './game/worldMaps'
import { GameStartup } from './gameStartup'
import { createFetchHandler, createWebSocketHandlers } from './server'
import { ipv4Address, WorldAdmin } from './worldAdmin'
import { openAdminTerminal } from './worldAdminTerminal'

type Environment = Record<string, string | undefined>

export async function startBackend(
    prepare: (signal: AbortSignal) => Promise<ReadyNpcAi>,
    env: Environment = Bun.env
): Promise<void> {
    const port = readPort(env, 'PORT', 3000)
    const localPort = readPort(env, 'GAME_LOCAL_ADMIN_PORT', 3001)
    const localHost = new URL(`http://127.0.0.1:${String(localPort)}`).host
    const localOrigins = configuredLocalOrigins(env['GAME_LOCAL_ADMIN_ORIGIN'])
    const publicOrigin = configuredPublicOrigin(env['GAME_ADMIN_ORIGIN'])
    const proxyPeer = trustedProxy(env['GAME_ADMIN_TLS_PROXY_IP'])
    const tls = configuredTls(env)
    const startup = new GameStartup(prepare, (ready, mode) => {
        knowledgeCorpus()
        const worldSeed = env['GAME_WORLD_SEED']
        const worldMaps = new WorldMaps(
            worldSeed === undefined ? {} : { seed: worldSeed }
        )
        const npcIdentitySeed = env['GAME_NPC_IDENTITY_SEED']
        const npcSpeechSeed = env['GAME_NPC_SPEECH_SEED']
        const speechTranslator = LocalSpeechTranslator.create()
        return new GameRoom(worldMaps.navigation(CENTER_LOCATION_ID), {
            worldMaps,
            worldSeed: worldMaps.seed,
            emptyWorldMode: mode,
            ...(npcIdentitySeed === undefined ? {} : { npcIdentitySeed }),
            ...(npcSpeechSeed === undefined ? {} : { npcSpeechSeed }),
            ...(speechTranslator === undefined ? {} : { speechTranslator }),
            ai: { config: ready.config, provider: ready.provider },
        })
    })
    const admin = new WorldAdmin({
        localHost,
        localOrigins,
        ...(publicOrigin === undefined ? {} : { publicOrigin }),
        ...(proxyPeer === undefined ? {} : { proxyPeer }),
        readMode: () => startup.worldMode,
        writeMode: (mode) => startup.setWorldMode(mode),
    })
    const room = () => startup.room
    const server = Bun.serve({
        port,
        ...(env['GAME_SERVER_HOST'] === undefined
            ? {}
            : { hostname: env['GAME_SERVER_HOST'] }),
        ...(tls === undefined ? {} : { tls }),
        fetch: createFetchHandler(room, {
            readiness: () => startup.readiness,
            admin,
            tls: tls !== undefined,
        }),
        websocket: createWebSocketHandlers(room),
    })
    const local = openLocalAdmin(admin, localPort, () => {
        void server.stop(true)
    })
    let closeTerminal: () => void
    try {
        closeTerminal = await openAdminTerminal(() => admin.issueCode())
    } catch (error) {
        await Promise.all([server.stop(true), local.stop(true)])
        throw error
    }

    console.info(`Backend listening on ${server.url.origin}`)
    console.info(`Host Admin listening on ${local.url.origin}`)
    const stop = () => {
        startup.stop()
        closeTerminal()
        void server.stop(true)
        void local.stop(true)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    void startup.start().catch((error: unknown) => {
        console.error('Game room initialization failed', error)
        process.exitCode = 1
        stop()
    })
}

function openLocalAdmin(admin: WorldAdmin, port: number, onError: () => void) {
    try {
        return Bun.serve({
            hostname: '127.0.0.1',
            port,
            fetch: (request, server) =>
                admin.handle(request, {
                    ingress: 'local',
                    peer: server.requestIP(request)?.address,
                    tls: false,
                }),
        })
    } catch (error) {
        onError()
        throw error
    }
}

function readPort(env: Environment, key: string, fallback: number): number {
    const port = Number(env[key] ?? fallback)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`Invalid ${key}`)
    }
    return port
}

function configuredLocalOrigins(input?: string): readonly string[] {
    if (input === undefined) {
        return ['http://localhost:5173', 'http://127.0.0.1:5173']
    }
    const url = exactOrigin(input)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        throw new Error('GAME_LOCAL_ADMIN_ORIGIN must use a loopback hostname')
    }
    return [url.origin]
}

function configuredPublicOrigin(input?: string): string | undefined {
    if (input === undefined) {
        return
    }
    const url = exactOrigin(input)
    if (url.protocol !== 'https:') {
        throw new Error('GAME_ADMIN_ORIGIN must use HTTPS')
    }
    return url.origin
}

function exactOrigin(input: string): URL {
    const url = new URL(input)
    if (url.origin !== input || !['http:', 'https:'].includes(url.protocol)) {
        throw new Error(
            'Expected an exact HTTP(S) origin without a path or credentials'
        )
    }
    return url
}

function configuredTls(
    env: Environment
): { cert: Bun.BunFile; key: Bun.BunFile } | undefined {
    const cert = env['GAME_SERVER_TLS_CERT']
    const key = env['GAME_SERVER_TLS_KEY']
    if (cert === undefined && key === undefined) {
        return
    }
    if (cert === undefined || key === undefined) {
        throw new Error('Provide both backend TLS paths')
    }
    return { cert: Bun.file(cert), key: Bun.file(key) }
}

function trustedProxy(input?: string): string | undefined {
    const address = ipv4Address(input)
    if (address === undefined) {
        return
    }
    const version = isIP(address)
    const privateIpv4 =
        /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u
    if (version === 4 && privateIpv4.test(address)) {
        return address
    }
    if (version === 6 && (address === '::1' || /^(fc|fd)/iu.test(address))) {
        return address
    }
    throw new Error(
        'GAME_ADMIN_TLS_PROXY_IP must identify a private, trusted TLS ingress peer'
    )
}
