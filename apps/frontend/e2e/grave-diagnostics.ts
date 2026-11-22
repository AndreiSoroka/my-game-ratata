import { writeFile } from 'node:fs/promises'

import {
    type ClientMessage,
    type GameEventPayload,
    type ResourceSnapshot,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import type { Page, TestInfo } from '@playwright/test'

/** Observe payment at channel start instead of after regeneration during the ritual. */
export function capturePrayerManaAtStart(page: Page): ResourceSnapshot[] {
    const mana: ResourceSnapshot[] = []
    let playerId: string | undefined
    let startedAt: number | undefined
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', (frame) => {
            if (typeof frame.payload !== 'string') return
            const message = JSON.parse(frame.payload) as ServerMessage
            if (message.type === 'world_init') playerId = message.playerId
            if (message.type !== 'world_init' && message.type !== 'snapshot') return
            const player = message.snapshot.characters.find((actor) => actor.id === playerId)
            const cast = player?.abilities?.casting
            if (
                player !== undefined &&
                cast?.abilityId === 'pray' &&
                cast.mode === 'purify_grave' &&
                cast.startedAt !== startedAt
            ) {
                startedAt = cast.startedAt
                mana.push(player.resources.mana)
            }
        })
    })
    return mana
}

export function capturePurificationTargets(page: Page): string[] {
    const targets: string[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framesent', (frame) => {
            if (typeof frame.payload !== 'string') return
            const command = JSON.parse(frame.payload) as ClientMessage
            if (
                command.type === 'use_ability' &&
                command.abilityId === 'pray' &&
                command.intent?.mode === 'purify_grave'
            )
                targets.push(command.intent.target.id)
        })
    })
    return targets
}

export function captureWorldDamage(page: Page): GameEventPayload[] {
    const events: GameEventPayload[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', (frame) => {
            if (typeof frame.payload !== 'string') return
            const message = JSON.parse(frame.payload) as ServerMessage
            if (message.type === 'event' && message.event.kind === 'world_damage')
                events.push(message.event)
        })
    })
    return events
}

export async function attachBrowserDiagnostics(
    info: TestInfo,
    error: unknown,
    events: string[]
): Promise<void> {
    await info.attach('browser-diagnostics', {
        contentType: 'application/json',
        body: JSON.stringify({ error: String(error), events }),
    })
}

export function captureBrowserDiagnostics(pages: Page[]): string[] {
    const events: string[] = []
    pages.forEach((page, index) => {
        const record = (message: string) => {
            if (events.length < 200) events.push(`page ${index}: ${message}`)
        }
        page.on('console', (message) => record(`${message.type()}: ${message.text()}`))
        page.on('pageerror', (error) => record(`pageerror: ${String(error)}`))
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) record(`navigation: ${frame.url()}`)
        })
    })
    return events
}

export async function attachCombatFailure(pages: Page[], info: TestInfo): Promise<void> {
    const party = await Promise.all(
        pages.map((page) =>
            page
                .evaluate(() => {
                    const state = window.__ratataTest!.getState()
                    const player = state.player
                    return {
                        connected: state.connected,
                        notice: state.notice,
                        prompt: document.querySelector('.nearby-prompt')?.textContent,
                        dialogs: Array.from(
                            document.querySelectorAll('[role="dialog"], [role="menu"]')
                        ).map((node) => node.getAttribute('aria-label')),
                        tick: state.snapshot?.tick,
                        locationId: state.location?.id,
                        player: player && {
                            id: player.id,
                            alive: player.alive,
                            health: player.health,
                            position: player.position,
                            control: player.control,
                            cooldowns: player.cooldowns,
                        },
                        threats: state.snapshot?.characters
                            .filter((actor) => actor.relationship === 'hostile')
                            .map((actor) => ({
                                id: actor.id,
                                alive: actor.alive,
                                health: actor.health,
                                position: actor.position,
                            })),
                        graves: state.snapshot?.graves,
                    }
                })
                .catch((error: unknown) => ({
                    observationError: String(error),
                    url: page.url(),
                }))
        )
    )
    const path = info.outputPath('grave-combat-failure.json')
    await writeFile(path, JSON.stringify(party, null, 2), 'utf8')
    await info.attach('grave-combat-failure', { contentType: 'application/json', path })
}
