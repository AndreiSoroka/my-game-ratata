import { type Vector2, WESTERN_RUINS_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

test('reaches Savva in Western Ruins and learns the Ash prayer through his interaction menu', async ({
    page,
}, info) => {
    test.setTimeout(120_000)
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page
        .getByRole('textbox', { name: 'Имя героя' })
        .fill(`ash-${info.workerIndex}-${Date.now().toString(36)}`)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
    await page.waitForFunction(
        () => {
            const state = window.__ratataTest?.getState()
            return state?.mapReady === true && state.player?.alive === true
        },
        undefined,
        { timeout: 15_000 }
    )

    for (let crossing = 0; crossing < 2; crossing += 1) {
        const travel = await page.evaluate(() =>
            window.__ratataTest!.travel('west', { timeoutMs: 30_000 })
        )
        expect(travel).toMatchObject({ status: 'arrived' })
    }
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot?.location?.id))
        .toBe(WESTERN_RUINS_LOCATION_ID)

    const necromancer = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot?.characters.find((actor) => actor.nickname === 'Савва')
    )
    expect(necromancer).toMatchObject({ visualId: 'necromancer', relationship: 'friendly' })
    await approachFromEast(page, necromancer!.position)
    await followTeacher(page, necromancer!.id)

    await selectSavva(page)
    await page.keyboard.press('KeyF')
    const lesson = page.getByRole('menuitem', { name: 'Изучить: Молитва праха', exact: true })
    await expect(lesson).toBeVisible()
    await lesson.dispatchEvent('click', undefined, { timeout: 2_000 })
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().player?.abilities?.known))
        .toContain('pray_grave')
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().player?.progression?.deity.id)
        )
        .toBe('grave')
    const sourceImage = await page.request.get('/game/assets/characters/necromancer.png')
    expect(sourceImage.ok()).toBe(true)
    expect(sourceImage.headers()['content-type']).toContain('image/png')
})

async function approachFromEast(page: Page, den: Vector2): Promise<void> {
    const eastPoint = await page.evaluate((point) => {
        const entrant = window.__ratataTest!.getState().player!
        return { x: entrant.position.x - 32, y: point.y }
    }, den)
    const east = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 15_000, tolerance: 24 }),
        eastPoint
    )
    expect(east).toMatchObject({ status: 'arrived' })
    await page.evaluate(() =>
        window.__ratataTest!.send({ type: 'movement_mode', mode: 'sneaking' })
    )
    await page.waitForFunction(
        () => window.__ratataTest?.getState().player?.movement?.mode === 'sneaking'
    )
    const reached = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 45_000, tolerance: 20 }),
        den
    )
    expect(reached).toMatchObject({ status: 'arrived' })
    expect(await page.evaluate(() => window.__ratataTest!.getState().player?.alive)).toBe(true)
}

async function selectSavva(page: Page): Promise<void> {
    const selected = selectedWorldTarget(page)
    const count = await page.evaluate(() => window.__ratataTest!.observe().targets.length + 1)
    for (let index = 0; index < count; index += 1) {
        await page.keyboard.press('Tab')
        if ((await selected.getAttribute('data-selected-target-name')) === 'Савва') break
    }
    await expect(selected).toHaveAttribute('data-selected-target-name', 'Савва')
}

async function followTeacher(page: Page, id: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const navigation = await page.evaluate(async (actorId) => {
            const api = window.__ratataTest!
            const observation = api.observe().targets.find((target) => target.id === actorId)
            if (
                observation?.actions.some(
                    ({ command }) =>
                        command.type === 'learn_ability' && command.abilityId === 'pray_grave'
                )
            )
                return undefined
            const actor = api.getState().snapshot?.characters.find((entry) => entry.id === actorId)
            if (!actor?.alive) throw new Error('Savva is unavailable')
            const destination = observation ? { targetKey: observation.key } : actor.position
            return api.navigate(destination, { tolerance: 24, timeoutMs: 20_000 })
        }, id)
        if (navigation === undefined) return
        expect(['arrived', 'target_lost']).toContain(navigation.status)
    }
    await expect
        .poll(() =>
            page.evaluate(
                (actorId) =>
                    window
                        .__ratataTest!.observe()
                        .targets.some(
                            (target) =>
                                target.id === actorId &&
                                target.actions.some(
                                    ({ command }) =>
                                        command.type === 'learn_ability' &&
                                        command.abilityId === 'pray_grave'
                                )
                        ),
                id
            )
        )
        .toBe(true)
}
