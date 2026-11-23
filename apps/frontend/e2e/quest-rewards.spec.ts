import { expect, type Locator, type Page, test } from '@playwright/test'

import { socialMenu } from './social-helpers'
import { abandonGuildContract, openObservedWorkerOffer } from './worker-contract-helpers'
import { enterBuilding, walkTo } from './world-navigation'

const scenarios = [
    {
        name: 'desktop',
        viewport: { width: 1280, height: 800 },
        workerMode: 'submitter',
        workerLabel: 'Вся награда сдающему',
        guildMode: 'party_equal',
        guildLabel: 'Поровну группе',
    },
    {
        name: 'mobile',
        viewport: { width: 390, height: 844 },
        workerMode: 'party_equal',
        workerLabel: 'Поровну группе',
        guildMode: 'submitter',
        guildLabel: 'Вся награда сдающему',
    },
]
for (const scenario of scenarios) {
    test(`fixes worker and guild reward sharing through ordinary UI (${scenario.name})`, async ({
        page,
    }, info) => {
        test.setTimeout(120_000)
        await page.setViewportSize(scenario.viewport)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'ranger'),
            `qr-${info.workerIndex}-${scenario.name[0]}-${Date.now().toString(36)}`
        )
        await approachMira(page)
        const { workerMode, guildMode } = scenario
        await expect(page.getByRole('dialog', { name: 'Разговор: Mira' })).toBeVisible()
        await openObservedWorkerOffer(page)
        const offer = page.getByRole('dialog', { name: 'Предложение поручения', exact: true })
        await expect(offer).toBeVisible()
        await assertCenteredViewport(offer)
        await expect(offer.getByRole('radio', { name: 'Поровну группе' })).toBeChecked()
        await offer.getByRole('radio', { name: scenario.workerLabel }).focus()
        await page.keyboard.press('KeyF')
        await expect(offer.locator(`input[value="${workerMode}"]`)).toBeChecked()
        await expectStationaryWithKey(page, 'KeyD')
        await offer.getByRole('button', { name: 'Взять', exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob)
            )
            .toMatchObject({ status: 'active', rewardMode: workerMode })
        await expect(offer).toBeHidden()
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeFocused()
        const workerInstance = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.party!.activeJob!.instanceId
        )
        try {
            const character = await openQuestJournal(page)
            const journal = character.getByRole('region', { name: 'Активные квесты' })
            await expect(journal).toBeVisible()
            await expect(journal).toContainText(scenario.workerLabel)
            await expect(journal.getByRole('radio')).toHaveCount(0)
            await assertFitsViewport(character)
            await page.screenshot({
                path: info.outputPath(`worker-rewards-${scenario.name}.png`),
            })
            await page.keyboard.press('Escape')
            await expect(journal).toBeHidden()
        } finally {
            await abandonGuildContract(page, workerInstance)
        }
        const contactId = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot?.party?.guildContact?.npcId
        )
        expect(contactId, 'No guild contact is available after the worker offer').toBeTruthy()
        const reviewGuildOffer = () =>
            socialMenu(page, contactId!, /^Взять «Зачистка троп» · 30 ◈$/)
        await reviewGuildOffer()
        await expect(offer.getByRole('heading', { name: 'Зачистка троп' })).toBeVisible()
        await assertCenteredViewport(offer)
        await offer.getByRole('button', { name: 'Отказаться', exact: true }).click()
        await expect(offer).toBeHidden()
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeFocused()
        await expect
            .poll(() =>
                page.evaluate(
                    () => window.__ratataTest!.getState().snapshot?.party?.activeJob?.status
                )
            )
            .not.toBe('active')

        await reviewGuildOffer()
        await offer.getByRole('radio', { name: scenario.guildLabel }).focus()
        await page.keyboard.press('KeyF')
        await expect(offer.locator(`input[value="${guildMode}"]`)).toBeChecked()
        await offer.getByRole('button', { name: 'Взять', exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob)
            )
            .toMatchObject({ id: 'slime_hunt', rewardMode: guildMode, status: 'active' })
        const guildInstance = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.party!.activeJob!.instanceId
        )
        try {
            const character = await openQuestJournal(page)
            await character.getByRole('button', { name: /Зачистка троп/ }).click()
            const active = character.getByRole('article', { name: 'Общий контракт' })
            await expect(active).toContainText(scenario.guildLabel)
            await expect(active.getByRole('radio')).toHaveCount(0)
            await assertFitsViewport(character)
            await page.screenshot({
                path: info.outputPath(`guild-rewards-${scenario.name}.png`),
            })
        } finally {
            await abandonGuildContract(page, guildInstance)
        }
    })
}

async function openQuestJournal(page: Page): Promise<Locator> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('KeyP')
    const character = page.getByRole('dialog', { name: 'Персонаж', exact: true })
    await character.getByRole('tab', { name: 'Квесты', exact: true }).click()
    return character
}

async function approachMira(page: Page): Promise<void> {
    await enterBuilding(page, 'Гильдия искателей')
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.observe()
                    .targets.some((target) => target.kind === 'character' && target.name === 'Mira')
            )
        )
        .toBe(true)
    const mira = await page.evaluate(() =>
        window
            .__ratataTest!.observe()
            .targets.find((target) => target.kind === 'character' && target.name === 'Mira')!
    )
    await walkTo(page, mira.position, 32)
    const opened = await page.evaluate(
        (targetId) =>
            window.__ratataTest!.act(
                { type: 'interact', targetId },
                { until: { type: 'dialogue', npcId: targetId } }
            ),
        mira.id
    )
    expect(opened.status).toBe('condition_met')
}

async function expectStationaryWithKey(page: Page, code: string): Promise<void> {
    const before = await page.evaluate(() => ({
        position: window.__ratataTest!.getState().player!.position,
        tick: window.__ratataTest!.getState().snapshot!.tick,
    }))
    await page.keyboard.down(code)
    try {
        const waited = await page.evaluate(
            (tick) => window.__ratataTest!.waitFor({ type: 'tick', after: tick + 4 }),
            before.tick
        )
        expect(waited.status).toBe('condition_met')
    } finally {
        await page.keyboard.up(code)
    }
    const after = await page.evaluate(() => window.__ratataTest!.getState().player!.position)
    expect(
        Math.hypot(after.x - before.position.x, after.y - before.position.y)
    ).toBeLessThanOrEqual(1)
}

async function assertFitsViewport(panel: ReturnType<Page['locator']>): Promise<void> {
    const geometry = await panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
            left: bounds.left,
            right: bounds.right,
            width: window.innerWidth,
            overflow: element.scrollWidth > element.clientWidth,
        }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.width)
    expect(geometry.overflow).toBe(false)
}

async function assertCenteredViewport(panel: Locator): Promise<void> {
    await assertFitsViewport(panel)
    const offset = await panel.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return {
            x: bounds.left + (bounds.width - window.innerWidth) / 2,
            y: bounds.top + (bounds.height - window.innerHeight) / 2,
        }
    })
    expect(Math.abs(offset.x)).toBeLessThanOrEqual(2)
    expect(Math.abs(offset.y)).toBeLessThanOrEqual(2)
}
