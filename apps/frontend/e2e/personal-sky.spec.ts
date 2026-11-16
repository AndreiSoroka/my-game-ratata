import type { HeroClass } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

const classes: HeroClass[] = ['vanguard', 'arcanist', 'cleric', 'ranger']
for (const width of [390, 1280]) {
    for (const heroClass of classes) {
        test(`${heroClass} receives a centered personal sky at ${width}px`, async ({
            page,
        }, info) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto('/?test=1')
            await page.waitForFunction(() => Boolean(window.__ratataTest))
            const name = `sky-${heroClass}-${width}-${info.project.name[0]}`
            await page.evaluate(
                ({ name, heroClass }) => window.__ratataTest!.join(name, heroClass),
                { name, heroClass }
            )
            const initial = await page.evaluate(() => {
                const player = window.__ratataTest!.getState().player!
                const sky = player.progression!.constellations!
                const center = sky.nodes.find((node) => node.id === sky.layout!.centerNodeId)!
                return { identity: player.id, layout: sky.layout, center }
            })
            expect(initial.center.x).toBe(0)
            expect(initial.center.y).toBe(0)
            await page.keyboard.press('KeyP')
            const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            await menu.getByRole('tab', { name: 'Развитие' }).click()
            const graph = menu.getByRole('group', { name: 'Созвездия развития' })
            await expect(menu.getByLabel('Выбранная звезда').getByRole('heading')).toHaveText(
                initial.center.name!
            )
            await expect
                .poll(() =>
                    graph.evaluate((element) => {
                        const box = (element as SVGSVGElement).viewBox.baseVal
                        return Math.max(
                            Math.abs(box.x + box.width / 2),
                            Math.abs(box.y + box.height / 2)
                        )
                    })
                )
                .toBeLessThan(0.001)
            await page.keyboard.press('Escape')
            await page.reload()
            await page.waitForFunction(() => Boolean(window.__ratataTest))
            await page.evaluate(
                ({ name, heroClass }) => window.__ratataTest!.join(name, heroClass),
                { name, heroClass }
            )
            const restored = await page.evaluate(() => {
                const player = window.__ratataTest!.getState().player!
                return { identity: player.id, layout: player.progression!.constellations!.layout }
            })
            expect(restored).toEqual({ identity: initial.identity, layout: initial.layout })
        })
    }
}
