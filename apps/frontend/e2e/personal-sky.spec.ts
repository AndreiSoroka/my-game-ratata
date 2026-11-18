import type { HeroClass } from '@my-game-ratata/contracts'
import { expect, type Locator, test } from '@playwright/test'

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
            await assertReceivedRoutes(graph)
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
            await page.screenshot({
                path: info.outputPath(`personal-sky-${heroClass}-${width}.png`),
            })
            await graph.locator(`[data-node-id="${initial.center.id}"] .hit`).click()
            await assertCurrentPathFits(graph, initial.center.id)
            await page.screenshot({
                path: info.outputPath(`personal-sky-${heroClass}-${width}-focused.png`),
            })
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

/** The production window must render exactly the authorized socket graph, including closed edges. */
async function assertReceivedRoutes(graph: Locator): Promise<void> {
    const projection = await graph.evaluate((element) => {
        const sky = window.__ratataTest!.getState().player!.progression!.constellations!
        const byId = new Map(sky.nodes.map((node) => [node.id, node]))
        return {
            expected: sky.edges.map((edge) => ({
                points: [byId.get(edge.from)!, ...(edge.via ?? []), byId.get(edge.to)!]
                    .map((point) => `${point.x},${point.y}`)
                    .join(' '),
                crossLink: edge.crossLink === true,
            })),
            rendered: [...element.querySelectorAll('polyline')].map((line) => ({
                points: line.getAttribute('points'),
                crossLink: line.classList.contains('constellation-edge--cross-link'),
            })),
            opaque: sky.nodes.every((node) => !node.id.includes('.')),
        }
    })
    expect(projection.rendered).toEqual(projection.expected)
    expect(projection.opaque).toBe(true)
}

async function assertCurrentPathFits(graph: Locator, rootId: string): Promise<void> {
    const focus = await graph.evaluate((element, rootId) => {
        const sky = window.__ratataTest!.getState().player!.progression!.constellations!
        const path = sky.nodes.find((node) => node.id === rootId)!.constellationId
        const nodes = sky.nodes.filter((node) => node.constellationId === path)
        const ids = new Set(nodes.map((node) => node.id))
        const points = [
            ...nodes,
            ...sky.edges
                .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
                .flatMap((edge) => edge.via ?? []),
        ]
        const box = (element as SVGSVGElement).viewBox.baseVal
        const margin = (20 * box.width) / element.getBoundingClientRect().width
        return {
            count: nodes.length,
            inside: points.every(
                (point) =>
                    point.x >= box.x + margin &&
                    point.x <= box.x + box.width - margin &&
                    point.y >= box.y + margin &&
                    point.y <= box.y + box.height - margin
            ),
        }
    }, rootId)
    expect(focus.count).toBeGreaterThan(1)
    expect(focus.inside).toBe(true)
}
