import { expect, type Locator, test } from '@playwright/test'

import {
    constellationWireId,
    fullConstellationCatalog,
} from '../../backend/src/game/constellationNodes'

const heroes = [
    { story: 'vanguard-development', root: 'Клинок' },
    { story: 'arcanist-development', root: 'Магия' },
    { story: 'development', root: 'Молитва' },
    { story: 'ranger-development', root: 'Быстрый выстрел' },
]
for (const width of [320, 390, 1280]) {
    for (const hero of heroes) {
        test(`${hero.root} personal sky centers and resets at ${width}px`, async ({
            page,
        }, info) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(
                `/iframe.html?id=pages-gameplay-characterwindow--${hero.story}&viewMode=story`
            )
            const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            const graph = menu.getByRole('group', { name: 'Созвездия развития' })
            await expect(graph).toBeVisible()
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                hero.root
            )
            await expect.poll(() => centeringError(graph, hero.root)).toBeLessThan(0.5)
            const initial = await graph.getAttribute('viewBox')
            await expectUnknownStarsInert(graph)
            const root = graph.getByRole('button', { name: hero.root, exact: true })
            await root.locator('.hit').click()
            await expect(root).toBeFocused()
            await expect(graph).not.toHaveAttribute('viewBox', initial!)
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                hero.root
            )
            await root.press('ArrowRight')
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).not.toHaveText(
                'Неизвестно'
            )
            await expectUnknownStarsInert(graph)
            await menu.getByRole('button', { name: 'Показать весь небосвод' }).click()
            await expect.poll(() => centeringError(graph, hero.root)).toBeLessThan(0.5)
            await expect(graph).toHaveAttribute('viewBox', initial!)
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                hero.root
            )
            await page.screenshot({
                path: info.outputPath(`personal-sky-${hero.story}-${width}.png`),
            })
        })
    }
}

test('visible Magic stars move at different speeds during repeated horizontal drags', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1400, height: 980 })
    await page.goto(
        '/iframe.html?id=pages-gameplay-characterwindow--arcanist-development&viewMode=story'
    )
    const graph = page.getByRole('group', { name: 'Созвездия развития' })
    await graph.getByRole('button', { name: 'Магия', exact: true }).locator('.hit').click()
    const magicIds = fullConstellationCatalog
        .filter((node) => node.id === 'magic.root' || node.parents.includes('magic.root'))
        .map((node) => constellationWireId(node.id))
    const bounds = (await graph.boundingBox())!
    const x = bounds.x + 180
    const y = bounds.y + 40
    await expect
        .poll(async () => Object.keys(await visibleStarPositions(graph, magicIds)).length)
        .toBeGreaterThan(5)

    let before = await visibleStarPositions(graph, magicIds)
    for (const distance of [100, 100, -100, -100]) {
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + distance, y, { steps: 8 })
        await page.mouse.up()
        const after = await visibleStarPositions(graph, magicIds)
        const displacements = Object.entries(after).flatMap(([id, position]) =>
            before[id] === undefined ? [] : [(position - before[id]) * Math.sign(distance)]
        )
        expect(displacements.length).toBeGreaterThan(3)
        expect(Math.min(...displacements)).toBeGreaterThan(0)
        expect(Math.max(...displacements) - Math.min(...displacements)).toBeGreaterThanOrEqual(10)
        before = after
    }
})

function visibleStarPositions(graph: Locator, ids: string[]): Promise<Record<string, number>> {
    return graph.evaluate((element, ids) => {
        const bounds = element.getBoundingClientRect()
        return Object.fromEntries(
            ids.flatMap((id) => {
                const node = element.querySelector<SVGGElement>(`[data-node-id="${id}"]`)
                const position = node?.getScreenCTM()
                if (
                    !node ||
                    !position ||
                    Number(getComputedStyle(node).opacity) === 0 ||
                    position.e < bounds.left ||
                    position.e > bounds.right ||
                    position.f < bounds.top ||
                    position.f > bounds.bottom
                )
                    return []
                return [[id, position.e]]
            })
        )
    }, ids)
}

async function expectUnknownStarsInert(graph: Locator): Promise<void> {
    const unknown = graph.locator('.constellation-node.closed')
    await expect(unknown.first()).toBeAttached()
    await expect(graph.locator('.closed[role]')).toHaveCount(0)
    await expect(graph.locator('.closed[tabindex]')).toHaveCount(0)
    await expect(graph.locator('.closed:not([aria-hidden="true"])')).toHaveCount(0)
    await expect(graph.locator('.closed.selected')).toHaveCount(0)
    await expect(unknown.first()).toHaveCSS('cursor', 'default')
    await expect(unknown.first().locator('.hit')).toHaveCSS('pointer-events', 'none')
}

async function centeringError(graph: Locator, root: string): Promise<number> {
    const frame = await graph.boundingBox()
    const star = await graph
        .getByRole('button', { name: root, exact: true })
        .locator('.hit')
        .boundingBox()
    if (!frame || !star) return Infinity
    return Math.max(
        Math.abs(star.x + star.width / 2 - frame.x - frame.width / 2),
        Math.abs(star.y + star.height / 2 - frame.y - frame.height / 2)
    )
}
