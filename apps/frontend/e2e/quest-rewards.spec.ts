import { expect, type Page, test } from '@playwright/test'

const scenarios = [
    {
        name: 'desktop',
        viewport: { width: 1280, height: 800 },
        storyMode: 'submitter',
        storyLabel: 'Вся награда сдающему',
        guildMode: 'party_equal',
        guildLabel: 'Поровну группе',
    },
    {
        name: 'mobile',
        viewport: { width: 390, height: 844 },
        storyMode: 'party_equal',
        storyLabel: 'Поровну группе',
        guildMode: 'submitter',
        guildLabel: 'Вся награда сдающему',
    },
]
for (const scenario of scenarios) {
    test(`fixes story and guild reward sharing through ordinary UI (${scenario.name})`, async ({
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
        const { storyMode, guildMode } = scenario
        const conversation = page.getByRole('dialog', { name: 'Разговор: Mira' })
        await expect(conversation).toBeVisible()
        await expect(conversation.getByRole('radio', { name: 'Поровну группе' })).toBeChecked()
        await conversation.getByRole('radio', { name: scenario.storyLabel }).focus()
        await page.keyboard.press('KeyF')
        await expect(conversation.locator(`input[value="${storyMode}"]`)).toBeChecked()
        await expectStationaryWithKey(page, 'KeyD')
        await conversation.getByRole('button', { name: 'Я принесу три слизневых сердца' }).focus()
        await page.keyboard.press('KeyF')
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.adventure?.quest)
            )
            .toMatchObject({ status: 'active', rewardMode: storyMode })
        await expect(conversation.getByRole('radio')).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(conversation).toBeHidden()
        await page.getByRole('button', { name: /^Квесты ·/ }).click()
        const journal = page.getByRole('region', { name: 'Активные квесты' })
        await expect(journal).toBeVisible()
        await expect(journal).toContainText(scenario.storyLabel)
        await expect(journal.getByRole('radio')).toHaveCount(0)
        await assertFitsViewport(page.getByRole('dialog', { name: 'Персонаж', exact: true }))
        await page.screenshot({
            path: info.outputPath(`story-rewards-${scenario.name}.png`),
        })
        await page.keyboard.press('Escape')
        await expect(journal).toBeHidden()
        await page.getByRole('button', { name: 'Гильдия', exact: true }).focus()
        await page.keyboard.press('KeyF')
        const guild = page.getByRole('dialog', { name: 'Гильдия приключенцев' })
        const hunt = guild
            .locator('.guild-job')
            .filter({ has: page.getByRole('heading', { name: 'Зачистка троп' }) })
        await expect(hunt.getByRole('button', { name: 'Взять', exact: true })).toBeEnabled()
        await hunt.getByRole('radio', { name: scenario.guildLabel }).focus()
        await page.keyboard.press('KeyF')
        await hunt.getByRole('button', { name: 'Взять', exact: true }).focus()
        await page.keyboard.press('KeyF')
        await expect
            .poll(() =>
                page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob)
            )
            .toMatchObject({ id: 'slime_hunt', rewardMode: guildMode, status: 'active' })
        const active = guild.getByRole('article', { name: 'Общий контракт' })
        await expect(active).toContainText(scenario.guildLabel)
        await expect(active.getByRole('radio')).toHaveCount(0)
        await assertFitsViewport(guild)
        await page.screenshot({
            path: info.outputPath(`guild-rewards-${scenario.name}.png`),
        })
    })
}

async function approachMira(page: Page): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.observe()
                    .targets.some(
                        (target) =>
                            target.kind === 'building' && target.name === 'Гильдия искателей'
                    )
            )
        )
        .toBe(true)
    const entrance = await page.evaluate(
        () =>
            window
                .__ratataTest!.observe()
                .targets.find(
                    (target) => target.kind === 'building' && target.name === 'Гильдия искателей'
                )!.key
    )
    const entered = await page.evaluate(
        (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 30_000 }),
        entrance
    )
    expect(entered.status, entered.reason).toBe('arrived')
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
    const approached = await page.evaluate(
        (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 30_000 }),
        mira.key
    )
    expect(approached.status, approached.reason).toBe('arrived')
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
