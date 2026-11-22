import type {
    ClientMessage,
    PortalEndpointSnapshot,
    ServerMessage,
} from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

for (const width of [390, 1280]) {
    test(`selects a local portal and cancels a magic channel at ${width}px`, async ({
        page,
    }, info) => {
        let playerId: string | undefined
        let portal: PortalEndpointSnapshot | undefined
        let channel = false
        let entered = false
        const actions: ClientMessage[] = []

        // Exercise the game client against a live map. The socket fixture supplies only
        // the UI state of an already-open portal and an already-started channel.
        await page.routeWebSocket(/\/ws$/, (client) => {
            const server = client.connectToServer()
            client.onMessage((data) => {
                const message = JSON.parse(data.toString()) as ClientMessage
                if (message.type === 'use_portal' || message.type === 'cancel_magic') {
                    actions.push(message)
                    if (message.type === 'use_portal') {
                        entered = true
                        channel = true
                    } else channel = false
                    return
                }
                server.send(data)
            })
            server.onMessage((data) => {
                const message = JSON.parse(data.toString()) as ServerMessage
                if (message.type === 'world_init') playerId = message.playerId
                if (message.type === 'world_init' || message.type === 'snapshot') {
                    const snapshot = message.snapshot
                    const player = snapshot.characters.find((actor) => actor.id === playerId)
                    if (player && snapshot.location) {
                        portal ??= {
                            id: 'ui-portal',
                            position: { ...player.position },
                            locationId: snapshot.location.id,
                            destinationLocationId: 'map-1-2',
                            destinationName: 'Предместье',
                            expiresAt: snapshot.serverTime + 60_000,
                        }
                        snapshot.portals = entered ? [] : [portal]
                        if (channel && player.abilities) {
                            player.abilities.magicChannel = {
                                abilityId: 'chains',
                                startedAt: snapshot.serverTime,
                                completesAt: snapshot.serverTime + 5_000,
                            }
                        }
                    }
                }
                client.send(JSON.stringify(message))
            })
        })

        await page.setViewportSize({ width, height: 840 })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (nickname) => window.__ratataTest!.join(nickname, 'arcanist'),
            `magic-${width}-${info.workerIndex}`
        )
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(canvas).toBeVisible()
        await canvas.focus()
        await page.keyboard.press('Tab')
        await expect(selectedWorldTarget(page)).toHaveAttribute(
            'data-selected-target-key',
            'portal:ui-portal'
        )
        await expect(page.getByRole('button', { name: /Портал — Предместье/ })).toBeVisible()
        await page.keyboard.press('KeyF')
        await expect
            .poll(() => actions)
            .toContainEqual({ type: 'use_portal', endpointId: 'ui-portal' })
        await expect(page.getByRole('status').filter({ hasText: /Оковы · 5 с/ })).toBeVisible()
        await expect(selectedWorldTarget(page)).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect.poll(() => actions).toContainEqual({ type: 'cancel_magic' })
        await expect(page.getByRole('button', { name: 'Прервать заклинание' })).toHaveCount(0)
    })
}
