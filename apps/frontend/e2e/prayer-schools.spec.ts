import { ABILITY_DEFINITIONS, type PrayerAbilityId } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

const schools: PrayerAbilityId[] = ['pray_road', 'pray_lantern', 'pray_grave', 'pray']
interface PrayerControls {
    cycle: string
    interact: string
    self: string
}

for (const width of [390, 1280]) {
    test(`learns and binds four independent prayers through the teacher (${width}px)`, async ({
        page,
    }, info) => {
        test.setTimeout(120_000)
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
        const controls = await prayerControls(page)
        await selectAlly(page, teacher.nickname, controls)
        for (const abilityId of schools) {
            await page.keyboard.press(controls.interact)
            const lesson = page.getByRole('menuitem', {
                name: `Изучить: ${ABILITY_DEFINITIONS[abilityId].name}`,
                exact: true,
            })
            await expect(lesson).toBeVisible()
            await lesson.press('Enter')
            await expect
                .poll(() =>
                    page.evaluate(
                        (id) =>
                            window.__ratataTest!.getState().player!.abilities!.known.includes(id),
                        abilityId
                    )
                )
                .toBe(true)
        }
        const player = await page.evaluate(() => window.__ratataTest!.getState().player!)
        expect(player.progression!.deity.id).toBe('road')
        expect(Object.keys(player.abilities!.prayers!)).toEqual(expect.arrayContaining(schools))
        await page.keyboard.press(controls.self)
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
            await page.keyboard.press(`Digit${index + 1}`)
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest!.getState().player!.abilities!.lastPrayerAbilityId
                    )
                )
                .toBe(abilityId)
            await expect
                .poll(() =>
                    page.evaluate(() => window.__ratataTest!.getState().player!.abilities!.casting)
                )
                .toBeNull()
            await expect
                .poll(() =>
                    page.evaluate(
                        (id) =>
                            window.__ratataTest!.getState().player!.abilities!.cooldowns[id] ?? 0,
                        abilityId
                    )
                )
                .toBe(0)
        }
        expect(
            (await page.evaluate(() => window.__ratataTest!.getState().player!)).progression!.deity
                .id
        ).toBe('road')
        await page.screenshot({ path: info.outputPath(`four-prayers-${width}.png`) })
    })
}

async function prayerControls(page: Page): Promise<PrayerControls> {
    return (await page.locator('body').innerText()).includes('Q себя')
        ? { cycle: 'KeyE', interact: 'KeyF', self: 'KeyQ' }
        : { cycle: 'Shift+KeyT', interact: 'KeyE', self: 'KeyF' }
}

async function selectAlly(page: Page, name: string, controls: PrayerControls): Promise<void> {
    const panel = page.getByLabel('Выбранная цель')
    const count = await page.evaluate(
        () => window.__ratataTest!.getState().snapshot!.characters.length + 1
    )
    for (let index = 0; index < count; index += 1) {
        await page.keyboard.press(controls.cycle)
        if (await panel.getByText(name, { exact: true }).isVisible()) break
    }
    await expect(panel.getByText(name, { exact: true })).toBeVisible()
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
