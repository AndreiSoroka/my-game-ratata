import {
    CENTER_LOCATION_ID,
    type GameEventPayload,
    type HeroClass,
    readTrainingMapData,
    type ServerMessage,
    type Vector2,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

const areaId = 'map-2-2:training:yard-1'
const dummyId = 'map-2-2:training:dummy-1'

test('shows the learned prayer radius in the authored training interior without a target', async ({
    page,
}, info) => {
    test.setTimeout(60_000)
    const yard = await join(page, `prayer-yard-${info.project.name}`, 'cleric')
    const canvas = page.locator('canvas[data-game-canvas=true]')
    await expect(canvas).not.toHaveAttribute('data-training-prayer-radius')
    await navigate(page, yard.inside)
    const prayer = await page.evaluate(
        () => window.__ratataTest!.getState().player!.abilities!.prayer!
    )
    expect(prayer.harm).toBe(false)
    await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
    await expect(canvas).toHaveAttribute('data-training-prayer-radius', String(prayer.radius))
    await page.screenshot({ path: info.outputPath('training-prayer-radius.png') })
    await navigate(page, yard.outside)
    await expect(canvas).not.toHaveAttribute('data-training-prayer-radius')
})

for (const mobile of [false, true]) {
    test(`trains with ordinary attacks and clears guides outside the pen (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(150_000)
        const hits: GameEventPayload[] = []
        let socketUrl = ''
        page.on('websocket', (socket) => {
            if (new URL(socket.url()).pathname !== '/ws' || socketUrl) return
            socketUrl = socket.url()
            socket.on('framereceived', (frame) => {
                if (typeof frame.payload !== 'string') return
                const message = JSON.parse(frame.payload) as {
                    type: string
                    event?: GameEventPayload
                }
                if (
                    message.type === 'event' &&
                    message.event?.kind === 'damage' &&
                    message.event.targetId === dummyId
                )
                    hits.push(message.event)
            })
        })
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        const name = `yard-${info.project.name}-${mobile}`
        const yard = await join(page, name)
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        await navigate(page, yard.inside)
        await expect(canvas).toHaveAttribute('data-training-guides', areaId)
        await canvas.focus()
        const selected = page.getByLabel('Выбранная цель')
        await selectTrainingTarget(page)
        await expect(selected).toContainText('Тренировочный манекен')
        await expect(selected.getByRole('progressbar')).toHaveCount(0)
        const before = await dummyState(page)
        const firstHit = hits.length
        await page.keyboard.press('Digit2')
        await expect.poll(() => hits.length).toBeGreaterThan(firstHit)
        expect(hits[firstHit]?.amount).toBeGreaterThan(0)
        expect(hits[firstHit]?.hitQuality).toMatch(/weak|normal|strong|critical/)
        expect(await dummyState(page)).toEqual(before)
        await page.screenshot({ path: info.outputPath('training-inside.png') })
        await page.screenshot({ path: `/tmp/ratata-training-${mobile ? 'mobile' : 'desktop'}.png` })

        await navigate(page, yard.outside)
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        const outsideHit = hits.length
        // A second ranger connects and walks through the same validated socket
        // commands. Its shot is observed from outside without opening another
        // WebGL page or changing either character's authoritative state.
        const guest = await shootAsGuest(page, socketUrl, `${name}-g`, yard.inside)
        expect(guest.amount).toBeGreaterThan(0)
        await expect
            .poll(() => hits.slice(outsideHit).some((hit) => hit.actorId === guest.actorId))
            .toBe(true)
        const observedGuest = hits.slice(outsideHit).find((hit) => hit.actorId === guest.actorId)
        expect(observedGuest).not.toHaveProperty('amount')
        expect(await dummyState(page)).toEqual(before)
        expect(await page.evaluate(() => window.__ratataTest!.getState().player!.position)).toEqual(
            yard.outside
        )
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        await page.screenshot({ path: info.outputPath('training-outside.png') })

        // Starting outside is allowed: ordinary auto-shot approaches through
        // the opening until shared range/LOS rules permit a hit.
        const resumedHit = hits.length
        await page.evaluate(
            (targetId) =>
                window.__ratataTest!.send({
                    type: 'auto_action',
                    action: { kind: 'ability', abilityId: 'shot', targetId },
                }),
            dummyId
        )
        await expect.poll(() => hits.length).toBeGreaterThan(resumedHit)
        expect(hits[resumedHit]?.amount).toBeGreaterThan(0)
        await expect(canvas).toHaveAttribute('data-training-guides', areaId)
        await page.evaluate(() => window.__ratataTest!.send({ type: 'cancel_control' }))
        const identity = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        await page.reload()
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await expect(page.locator('canvas[data-training-guides]')).toHaveCount(0)
        await page.evaluate((name) => window.__ratataTest!.join(name, 'ranger'), name)
        expect(await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)).toBe(
            identity
        )
        await expect(canvas).toHaveAttribute('data-training-guides', areaId)

        const departure = await page.evaluate(() =>
            window.__ratataTest!.travel('east', { timeoutMs: 30_000 })
        )
        expect(departure, JSON.stringify(departure)).toMatchObject({
            status: 'arrived',
            locationId: 'map-3-2',
        })
        await expect(canvas).not.toHaveAttribute('data-training-guides')
        expect(await page.evaluate(() => window.__ratataTest!.getState().player!.alive)).toBe(true)
    })
}

async function join(page: Page, name: string, heroClass: HeroClass = 'ranger') {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    const cityMap = page.waitForResponse((response) => {
        const path = new URL(response.url()).pathname
        return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
    })
    await page.evaluate(({ name, heroClass }) => window.__ratataTest!.join(name, heroClass), {
        name,
        heroClass,
    })
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
    const map = (await (await cityMap).json()) as Parameters<typeof readTrainingMapData>[0]
    const training = readTrainingMapData(map, CENTER_LOCATION_ID)
    const area = training.areas.find((candidate) => candidate.id === areaId)!
    const dummy = training.targets.find((candidate) => candidate.id === dummyId)!
    // The generated yard keeps its authored west entrance aligned with the
    // dummy; stay inside Shot range and just outside its interior respectively.
    return {
        inside: { x: dummy.position.x - map.tilewidth * 3.5, y: dummy.position.y },
        outside: { x: area.bounds.x - map.tilewidth / 2, y: dummy.position.y },
    }
}

async function selectTrainingTarget(page: Page): Promise<void> {
    const targetCount = await page.evaluate(() => window.__ratataTest!.observe().targets.length)
    for (let count = 0; count <= targetCount; count += 1) {
        await page.keyboard.press('KeyE')
        if (
            await page
                .getByLabel('Выбранная цель')
                .getByText('Тренировочный манекен', { exact: true })
                .isVisible()
        )
            return
    }
}

async function navigate(page: Page, position: { x: number; y: number }): Promise<void> {
    const outcome = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 25_000, tolerance: 1 }),
        position
    )
    expect(outcome.status, JSON.stringify(outcome)).toBe('arrived')
}

async function dummyState(page: Page) {
    return page.evaluate((id) => {
        const target = window
            .__ratataTest!.getState()
            .snapshot!.characters.find((actor) => actor.id === id)!
        return { position: target.position, alive: target.alive, health: target.health }
    }, dummyId)
}

async function shootAsGuest(page: Page, url: string, name: string, inside: Vector2) {
    return page.evaluate(
        ({ url, name, dummyId, inside }) =>
            new Promise<{
                amount: number | undefined
                actorId: string
            }>((resolve, reject) => {
                const socket = new WebSocket(url)
                let actorId: string | undefined
                let fired = false
                const timeout = window.setTimeout(() => {
                    socket.close()
                    reject(new Error('Guest ranger did not reach and hit the dummy'))
                }, 20_000)
                socket.addEventListener('open', () =>
                    socket.send(
                        JSON.stringify({
                            type: 'join',
                            nickname: name,
                            heroClass: 'ranger',
                        })
                    )
                )
                socket.addEventListener('message', ({ data }) => {
                    const message = JSON.parse(String(data)) as ServerMessage
                    if (message.type === 'world_init') {
                        actorId = message.playerId
                        socket.send(JSON.stringify({ type: 'move_to', target: inside }))
                    }
                    if (message.type === 'snapshot') {
                        const actor = message.snapshot.characters.find(
                            (candidate) => candidate.id === actorId
                        )
                        if (
                            !fired &&
                            actor &&
                            Math.hypot(actor.position.x - inside.x, actor.position.y - inside.y) < 1
                        ) {
                            fired = true
                            socket.send(
                                JSON.stringify({
                                    type: 'use_ability',
                                    abilityId: 'shot',
                                    targetId: dummyId,
                                })
                            )
                        }
                    }
                    if (
                        message.type === 'event' &&
                        message.event.kind === 'damage' &&
                        message.event.targetId === dummyId &&
                        message.event.actorId === actorId &&
                        actorId
                    ) {
                        window.clearTimeout(timeout)
                        resolve({ amount: message.event.amount, actorId })
                        socket.close()
                    }
                })
            }),
        { url, name, dummyId, inside }
    )
}
