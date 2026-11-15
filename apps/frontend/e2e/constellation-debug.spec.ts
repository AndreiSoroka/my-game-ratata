import { expect, test } from '@playwright/test'

import { assertBuildWorkflow, selectBuildStar } from './atlas-build-workflow'

for (const width of [320, 390, 1280]) {
    test(`mastery atlas is compact and consistent at ${width}px`, async ({ page }) => {
        test.setTimeout(90_000)
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/?debug=constellations&class=cleric&seed=mastery-atlas')
        const atlas = page.getByTestId('constellation-debug')
        await expect(atlas).toBeVisible()
        await expect(page.locator('[data-star-id]')).toHaveCount(77)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width
        )
        await assertBuildWorkflow(page, width, test.info())
        const initial = await page
            .locator('[data-node-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
        await page.getByTestId('debug-seed').fill('another-mastery-sky')
        await page.getByTestId('debug-apply').click()
        await expect
            .poll(() =>
                page
                    .locator('[data-node-id]')
                    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('transform')))
            )
            .not.toEqual(initial)
        await expect(page.locator('[data-node-id="prayer.revive"]')).toHaveAttribute(
            'data-enabled',
            'true'
        )
        await page.getByTestId('debug-class').selectOption('vanguard')
        await expect(page.locator('[data-node-id="blade.root"]')).toHaveAttribute(
            'data-enabled',
            'true'
        )
        await page.getByTestId('debug-class').selectOption('cleric')
        await expect(page.locator('[data-node-id="prayer.revive"]')).toHaveAttribute(
            'data-enabled',
            'true'
        )
        await page.getByTestId('debug-build-all').click()
        const ids = await page
            .locator('[data-star-id]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-star-id')!))
        for (const id of ids) {
            await selectBuildStar(page, id)
            await expect(
                page.getByTestId('selected-star-card').getByRole('heading')
            ).not.toBeEmpty()
            await expect(page.getByTestId('debug-star-minimum')).toBeAttached()
            await expect(page.getByTestId('debug-effect-chance')).toBeAttached()
            await expect(page.getByTestId('debug-unlock-conditions')).toBeAttached()
            const chance = page.getByTestId('debug-effect-chance')
            await chance.locator(':scope > summary').click()
            await expect(
                chance.locator('[data-testid="debug-effect-formula"]').first()
            ).toBeVisible()
            await chance.locator(':scope > summary').click()
        }
        await page.getByTestId('debug-search').fill('')
        await expect(page.locator('[data-star-id]')).toHaveCount(77)
        await selectBuildStar(page, 'arrow.root')
        await expect(page.getByTestId('debug-mastery-rate')).toContainText('XP')
        await page.getByTestId('debug-show-summary').click()
        await expect(
            page.locator('[data-build-metric="Итоговый множитель урона Выстрела"] dd')
        ).toHaveText('×1,2')
        await page.getByTestId('debug-runic-charged').check()
        await expect(
            page.locator('[data-build-metric="Итоговый множитель урона Выстрела"] dd')
        ).toHaveText('×1,32')
    })
}

test('debug atlas never joins a player or sends gameplay requests', async ({ page }) => {
    const sockets: string[] = [],
        requests: string[] = []
    page.on('websocket', (socket) => sockets.push(socket.url()))
    page.on('request', (request) => requests.push(request.url()))
    await page.goto('/?debug=constellations&class=cleric&seed=mastery-network')
    await expect(page.getByTestId('constellation-debug')).toBeVisible()
    await page.getByTestId('debug-build-all').click()
    await selectBuildStar(page, 'prayer.root')
    await page.getByTestId('debug-prayer-mood').selectOption('wrathful')
    expect(sockets).toEqual([])
    expect(requests.filter((url) => /\/ws\b|\/api\/|:3000/.test(url))).toEqual([])
})

test('ordinary entry remains the player sign-in page', async ({ page }) => {
    await page.goto('/?test=1')
    await expect(page.getByTestId('constellation-debug')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Enter', exact: true })).toBeVisible()
})
