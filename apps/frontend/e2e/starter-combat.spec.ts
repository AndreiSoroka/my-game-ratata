import { ABILITY_DEFINITIONS, type ServerMessage } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { travelParty } from './grave-targeting'

test('a starter Spark gives a skeleton time to close and hit the mage', async ({ page }) => {
    test.setTimeout(200_000)
    const events: Extract<ServerMessage, { type: 'event' }>[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string') return
            const message = JSON.parse(payload) as ServerMessage
            if (message.type === 'event') events.push(message)
        })
    })
    await joinMage(page)
    const marker = await travelParty([page], 'south', 60_000)
    const encounter = await page.evaluate(
        async ({ marker, range }) => {
            const api = window.__ratataTest!
            // Scout from the map edge and watch for patrols on the northeast approach.
            const approach = { x: marker.x + 128, y: marker.y - 112 }
            const nearGrave = { x: marker.x + 32, y: marker.y - 32 }
            let approachingGrave = false
            api.send({ type: 'movement_mode', mode: 'sneaking' })
            api.send({ type: 'move_to', target: approach })
            const start = api.getState().snapshot!.serverTime
            let state = api.getState()
            while (state.player?.alive && state.snapshot!.serverTime < start + 60_000) {
                const { player, snapshot } = state
                if (
                    !approachingGrave &&
                    Math.hypot(player.position.x - approach.x, player.position.y - approach.y) <= 8
                ) {
                    approachingGrave = true
                    api.send({ type: 'move_to', target: nearGrave })
                }
                const rangedSkeletons = snapshot!.characters
                    .filter(
                        (actor) =>
                            actor.archetype === 'skeleton' &&
                            actor.alive &&
                            actor.relationship === 'hostile'
                    )
                    .map(({ id, position }) => ({
                        id,
                        position,
                        distance: Math.hypot(
                            player.position.x - position.x,
                            player.position.y - position.y
                        ),
                    }))
                    .filter(({ distance }) => distance > 30)
                const skeleton = rangedSkeletons.find(({ distance }) => distance < range - 5)
                if (skeleton) {
                    api.send({ type: 'movement_mode', mode: 'walking' })
                    // Forward casts are valid even when a moving skeleton is off the aim line.
                    await api.act({ type: 'use_ability', abilityId: 'spark' })
                    const cast = api.getState().player?.combat?.action
                    if (cast?.abilityId === 'spark') {
                        const position = api.getState().player!.position
                        const away = {
                            x: Math.sign(position.x - skeleton.position.x),
                            y: Math.sign(position.y - skeleton.position.y),
                        }
                        await api.moveFor(away, 480)
                        return {
                            actorId: player.id,
                            rangedSkeletonIds: rangedSkeletons.map(({ id }) => id),
                            cast,
                            position,
                            positionAfterEscapeInput: api.getState().player?.position,
                        }
                    }
                }
                await api.waitFor({ type: 'tick', after: snapshot!.tick }, { timeoutMs: 2000 })
                state = api.getState()
            }
            throw new Error('No Spark started within range of a live skeleton')
        },
        { marker, range: ABILITY_DEFINITIONS.spark.range }
    )
    expect(encounter.cast.hitAt - encounter.cast.startedAt).toBeGreaterThanOrEqual(1000)
    expect(encounter.positionAfterEscapeInput).toEqual(encounter.position)
    const phases = () =>
        events.map(({ event }) => event).filter(({ actionId }) => actionId === encounter.cast.id)
    expect(phases()).toContainEqual(
        expect.objectContaining({
            kind: 'attack',
            phase: 'started',
            actorId: encounter.actorId,
        })
    )
    await expect
        .poll(() => phases().some(({ phase }) => phase === 'completed' || phase === 'interrupted'))
        .toBe(true)
    await expect
        .poll(
            () =>
                events.some(
                    ({ serverTime, event }) =>
                        serverTime >= encounter.cast.startedAt &&
                        event.kind === 'damage' &&
                        event.actorId !== undefined &&
                        encounter.rangedSkeletonIds.includes(event.actorId) &&
                        event.targetId === encounter.actorId
                ),
            { timeout: 10_000 }
        )
        .toBe(true)
})

async function joinMage(page: Page): Promise<void> {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(async () => {
        try {
            await window.__ratataTest!.join(`starter-spark-${Date.now().toString(36)}`, 'arcanist')
        } catch (error) {
            if (
                !(error instanceof Error) ||
                error.message !== 'Timed out waiting for the game connection'
            )
                throw error
        }
    })
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const { connected, mapReady, player, error } = window.__ratataTest!.getState()
                    return { connected, mapReady, alive: player?.alive, error }
                }),
            { timeout: 30_000, message: 'The mage joined and the city map finished loading' }
        )
        .toEqual({ connected: true, mapReady: true, alive: true, error: '' })
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
}
