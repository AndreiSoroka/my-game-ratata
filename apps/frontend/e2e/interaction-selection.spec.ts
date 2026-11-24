import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { joinSocial, selectSocialTarget } from './social-helpers'
import { selectedWorldTarget } from './world-target-ui'

for (const layout of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
]) {
    test(`switches between overlapping F targets (${layout.name})`, async ({ page, browser }) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width: layout.width, height: layout.height })
        const peers = await browser.newContext()
        try {
            const first = await peers.newPage()
            const second = await peers.newPage()
            await joinSocial(page, `f-observer-${layout.name}`)
            const firstName = `f-first-${layout.name}`
            const secondName = `f-second-${layout.name}`
            const firstId = await joinSocial(first, firstName)
            const secondId = await joinSocial(second, secondName)
            const meeting = await playerPosition(first)
            await walkTo(second, meeting)
            await walkTo(page, meeting)
            const [left, right] = [
                { id: firstId, name: firstName },
                { id: secondId, name: secondName },
            ].sort((a, b) => a.id.localeCompare(b.id))
            const canvas = page.locator('canvas[data-game-canvas=true]')
            await canvas.focus()
            await selectSocialTarget(page, left!.id)
            const before = await playerPosition(page)
            await openNearbyMenu(page, layout.name === 'mobile')
            const menu = page.getByRole('menu')
            await expect(menu).toHaveAccessibleName(left!.name)
            await expectNameFocus(page, left!.id, right!.id)

            await page.keyboard.press('ArrowRight')
            await expect(menu).toHaveAccessibleName(right!.name)
            await expectNameFocus(page, right!.id, left!.id)
            await page.keyboard.press('KeyA')
            await expect(menu).toHaveAccessibleName(left!.name)
            await page.keyboard.press('KeyD')
            await expect(menu).toHaveAccessibleName(right!.name)
            const whisper = menu.getByRole('menuitem', { name: `Шёпот: ${right!.name}` })
            await expect(whisper).toBeFocused()
            await expect(page.getByRole('dialog', { name: /^Шёпот:/u })).toHaveCount(0)
            await page.keyboard.press('KeyF')
            await expect(page.getByRole('dialog', { name: `Шёпот: ${right!.name}` })).toBeVisible()
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest!.getState().snapshot?.social?.whisper?.partnerId
                    )
                )
                .toBe(right!.id)
            expect(await playerPosition(page)).toEqual(before)
            await page.keyboard.press('Escape')
            await canvas.focus()
            await page.keyboard.press('Escape')
            await expect(selectedWorldTarget(page)).toHaveCount(0)
            await expect.poll(() => nameOpacities(page, left!.id, right!.id)).toEqual([1, 1])
        } finally {
            await peers.close()
        }
    })
}

function playerPosition(page: Page): Promise<Vector2> {
    return page.evaluate(() => window.__ratataTest!.getState().player!.position)
}

async function openNearbyMenu(page: Page, mobile: boolean): Promise<void> {
    if (mobile) await page.locator('.hotbar').getByRole('button', { name: /^F /u }).click()
    else await page.keyboard.press('KeyF')
}

async function walkTo(page: Page, point: Vector2): Promise<void> {
    const result = await page.evaluate(
        (destination) => window.__ratataTest!.navigate(destination, { tolerance: 0 }),
        point
    )
    expect(result).toMatchObject({ status: 'arrived' })
}

function nameOpacities(page: Page, first: string, second: string) {
    return page.evaluate(
        (ids) => ids.map((id) => window.__ratataGameDebug?.characterNameOpacity?.(id)),
        [first, second]
    )
}

async function expectNameFocus(page: Page, selectedId: string, otherId: string): Promise<void> {
    await expect(selectedWorldTarget(page)).toHaveAttribute(
        'data-selected-target-key',
        `character:${selectedId}`
    )
    await expect.poll(() => nameOpacities(page, selectedId, otherId)).toEqual([1, 0.35])
}
