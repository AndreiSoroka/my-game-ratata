import { ABILITY_DEFINITIONS, type PrayerAbilityId } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

const schools: PrayerAbilityId[] = ['pray_road', 'pray']
const unavailableSchools: PrayerAbilityId[] = ['pray_lantern', 'pray_grave']

for (const width of [390, 1280]) {
    test(`learns Vera's two independent prayers and refuses unknown schools (${width}px)`, async ({
        page,
    }, info) => {
        test.setTimeout(120_000)
        const rejectedLessons = observeRejectedLessons(page)
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'ranger'),
            `schools-${width}-${info.project.name}`
        )
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window
                        .__ratataTest!.observe()
                        .targets.some(
                            (target) =>
                                target.kind === 'building' && target.name === 'Часовня памяти'
                        )
                )
            )
            .toBe(true)
        await enterChapel(page)
        const teacher = await page.evaluate(() => {
            const api = window.__ratataTest!
            const observed = api
                .observe()
                .targets.find(
                    (target) => target.kind === 'character' && target.name === 'Сестра Вера'
                )!
            return api.getState().snapshot!.characters.find((actor) => actor.id === observed.id)!
        })
        const navigation = await page.evaluate(
            (id) =>
                window.__ratataTest!.navigate(
                    { targetKey: `character:${id}` },
                    { timeoutMs: 30_000, tolerance: 24 }
                ),
            teacher.id
        )
        expect(navigation.status).toBe('arrived')
        await selectAlly(page, teacher.nickname)
        await assertUnavailableLessons(page, teacher.id, rejectedLessons)
        const slots = page.getByLabel('Быстрые действия').getByRole('button', { name: /^[1-4]:/ })
        const roadPrayerInFourthSlot = new RegExp(`^4: ${ABILITY_DEFINITIONS.pray_road.name}`)
        await expect(slots.nth(3)).toHaveAccessibleName(/4: Пусто/)
        await learnPrayer(page, 'pray_road')
        await expect(slots.nth(3)).toHaveAccessibleName(roadPrayerInFourthSlot)
        await learnPrayer(page, 'pray')
        await expect(slots.nth(0)).toHaveAccessibleName(/^1: Удар ножом/)
        await expect(slots.nth(1)).toHaveAccessibleName(/^2: Быстрый выстрел/)
        await expect(slots.nth(2)).toHaveAccessibleName(/^3: Снайперский выстрел/)
        await expect(slots.nth(3)).toHaveAccessibleName(roadPrayerInFourthSlot)
        const player = await page.evaluate(() => window.__ratataTest!.getState().player!)
        expect(player.progression!.deity.id).toBe('road')
        expect(Object.keys(player.abilities!.prayers!)).toEqual(expect.arrayContaining(schools))
        for (const abilityId of unavailableSchools)
            expect(player.abilities!.known).not.toContain(abilityId)
        await page.keyboard.press('KeyQ')
        for (const [index, abilityId] of schools.entries()) {
            await page.keyboard.press(`Shift+Digit${index + 1}`)
            const picker = page.getByRole('dialog', { name: `Назначить слот ${index + 1}` })
            await picker
                .getByRole('button', {
                    name: new RegExp(`${ABILITY_DEFINITIONS[abilityId].name} \\d+ MP`),
                })
                .click()
            const slot = page.getByLabel('Быстрые действия').getByRole('button', {
                name: new RegExp(`^${index + 1}: ${ABILITY_DEFINITIONS[abilityId].name}`),
            })
            await expect(slot).toBeVisible()
            await castLearnedPrayer(page, abilityId, index + 1)
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest?.getState().player?.abilities?.lastPrayerAbilityId
                    )
                )
                .toBe(abilityId)
            await expect
                .poll(() =>
                    page.evaluate(() => window.__ratataTest?.getState().player?.abilities?.casting)
                )
                .toBeNull()
            await expect
                .poll(() =>
                    page.evaluate((id) => {
                        const player = window.__ratataTest?.getState().player
                        if (player?.abilities) return player.abilities.cooldowns[id] ?? 0
                    }, abilityId)
                )
                .toBe(0)
        }
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest?.getState().player?.progression?.deity.id)
            )
            .toBe('road')
        await page.screenshot({ path: info.outputPath(`vera-two-prayers-${width}.png`) })
    })
}

async function learnPrayer(page: Page, abilityId: PrayerAbilityId): Promise<void> {
    await page.keyboard.press('KeyF')
    const lesson = page.getByRole('menuitem', {
        name: `Изучить: ${ABILITY_DEFINITIONS[abilityId].name}`,
        exact: true,
    })
    await expect(lesson).toBeVisible()
    await lesson.press('Enter')
    await expect
        .poll(() =>
            page.evaluate(
                (id) => window.__ratataTest?.getState().player?.abilities?.known.includes(id),
                abilityId
            )
        )
        .toBe(true)
}

async function castLearnedPrayer(
    page: Page,
    abilityId: PrayerAbilityId,
    slot: number
): Promise<void> {
    if (abilityId === 'pray_road') await spendEnergyOnDash(page)
    await page.keyboard.press(`Digit${slot}`)
    if (abilityId === 'pray_road') await expectRoadSong(page)
}

async function spendEnergyOnDash(page: Page): Promise<void> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('Space')
    await page.waitForFunction(() => {
        const player = window.__ratataTest?.getState().player
        const energy = document.querySelector('[role="progressbar"][aria-label="Энергия"]')
        return (
            player?.movement?.dashing === false &&
            player.movement.dashCooldownMsLeft > 0 &&
            Number(energy?.getAttribute('aria-valuenow') ?? 100) < 90
        )
    })
}

async function expectRoadSong(page: Page): Promise<void> {
    const song = page.getByRole('button', { name: 'Походная песня · восстановление EN ×5' })
    await expect(song).toBeVisible()
    await page.waitForFunction(() => {
        const player = window.__ratataTest?.getState().player
        const cast = player?.abilities?.casting
        const zone = window.__ratataGameDebug
            ?.prayerAreas?.()
            .find((area) => area.actorId === player?.id)
        const energy = document.querySelector('[role="progressbar"][aria-label="Энергия"]')
        return (
            cast?.abilityId === 'pray_road' &&
            zone?.abilityId === cast.abilityId &&
            zone.radius === cast.radius &&
            energy?.getAttribute('aria-valuenow') === '100'
        )
    })
    await expect(song).toHaveCount(0)
}

async function selectAlly(page: Page, name: string): Promise<void> {
    const selected = selectedWorldTarget(page)
    const count = await page.evaluate(() => window.__ratataTest!.observe().targets.length + 1)
    for (let index = 0; index < count; index += 1) {
        await page.keyboard.press('Tab')
        if ((await selected.getAttribute('data-selected-target-name')) === name) break
    }
    await expect(selected).toHaveAttribute('data-selected-target-name', name)
}

async function enterChapel(page: Page): Promise<void> {
    const entered = await page.evaluate(() => {
        const api = window.__ratataTest!
        const chapel = api
            .observe()
            .targets.find(
                (target) => target.kind === 'building' && target.name === 'Часовня памяти'
            )!
        return api.navigate({ targetKey: chapel.key }, { timeoutMs: 30_000 })
    })
    expect(entered.status).toBe('arrived')
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.observe()
                    .targets.some(
                        (target) => target.kind === 'character' && target.name === 'Сестра Вера'
                    )
            )
        )
        .toBe(true)
}

function observeRejectedLessons(page: Page): string[] {
    const notices: string[] = []
    page.on('websocket', (socket) => {
        socket.on('framereceived', ({ payload }) => {
            const text = typeof payload === 'string' ? payload : payload.toString('utf8')
            if (text.includes('Этот персонаж не обучает выбранной способности.')) notices.push(text)
        })
    })
    return notices
}

async function assertUnavailableLessons(
    page: Page,
    teacherId: string,
    rejectedLessons: string[]
): Promise<void> {
    await page.keyboard.press('KeyF')
    for (const abilityId of unavailableSchools) {
        await expect(
            page.getByRole('menuitem', {
                name: `Изучить: ${ABILITY_DEFINITIONS[abilityId].name}`,
                exact: true,
            })
        ).toHaveCount(0)
    }
    await page.keyboard.press('Escape')
    for (const [index, abilityId] of unavailableSchools.entries()) {
        await page.evaluate(
            ({ id, targetId }) =>
                window.__ratataTest!.send({
                    type: 'learn_ability',
                    abilityId: id,
                    targetId,
                }),
            { id: abilityId, targetId: teacherId }
        )
        await expect.poll(() => rejectedLessons.length).toBe(index + 1)
        expect(
            await page.evaluate(
                (id) => window.__ratataTest!.getState().player!.abilities!.known.includes(id),
                abilityId
            )
        ).toBe(false)
    }
}
