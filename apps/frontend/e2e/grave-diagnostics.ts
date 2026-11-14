import { writeFile } from 'node:fs/promises'

import type { Page, TestInfo } from '@playwright/test'

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
                        tick: state.snapshot?.tick,
                        locationId: state.location?.id,
                        player: player && {
                            id: player.id,
                            alive: player.alive,
                            hp: player.hp,
                            position: player.position,
                            control: player.control,
                            cooldowns: player.cooldowns,
                        },
                        threats: state.snapshot?.characters
                            .filter((actor) => actor.relationship === 'hostile')
                            .map((actor) => ({
                                id: actor.id,
                                alive: actor.alive,
                                hp: actor.hp,
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
