import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

test('scrolls the stars along the western map edge and restores them after travel', async ({
    page,
}) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(
        (name) => window.__ratataTest!.join(name, 'vanguard'),
        `backdrop-${Date.now().toString(36)}`
    )
    const { locationId, west, tileWidth, tileHeight } = await page.evaluate(() => {
        const observation = window.__ratataTest!.observe()
        const { map, id } = observation.location!
        return {
            locationId: id,
            west: observation.exits.find((exit) => exit.direction === 'west')!,
            tileWidth: map.tileWidth,
            tileHeight: map.tileHeight,
        }
    })
    const start = { x: west.position.x + tileWidth, y: west.position.y }
    await walk(page, start, locationId)
    const before = await captureSettledStars(page, 'west')
    expect(before.stars.length).toBeGreaterThan(0)

    await walk(page, { x: start.x, y: start.y + tileHeight * 5 }, locationId)
    const after = await captureSettledStars(page, 'west')
    const terrainScroll = before.terrainY - after.terrainY
    expect(terrainScroll).toBeGreaterThan(100)
    expect(after.stars).not.toEqual(before.stars)
    const visibleSpeeds = [0.64, 0.7, 0.76, 0.82, 0.88].filter((speed) =>
        before.stars.some((star) =>
            after.stars.some(
                (next) =>
                    next.shade === star.shade &&
                    Math.abs(next.x - star.x) <= 1 &&
                    Math.abs(star.y - next.y - terrainScroll * speed) <= 2
            )
        )
    )
    expect(visibleSpeeds.length).toBeGreaterThanOrEqual(3)
    await expect.poll(async () => (await captureStars(page, 'west')).stars).toEqual(after.stars)

    const travel = await page.evaluate(() =>
        window.__ratataTest!.travel('west', { timeoutMs: 30_000 })
    )
    expect(travel).toMatchObject({ status: 'arrived', locationId: west.locationId })
    expect((await captureSettledStars(page, 'east')).stars.length).toBeGreaterThan(0)
})

async function walk(page: Page, point: Vector2, locationId: string): Promise<void> {
    const result = await page.evaluate(
        (destination) => window.__ratataTest!.navigate(destination, { tolerance: 1 }),
        point
    )
    expect(result, result.reason).toMatchObject({ status: 'arrived', locationId })
}

async function captureSettledStars(page: Page, side: 'west' | 'east') {
    let previousY: number | undefined
    await expect
        .poll(async () => {
            const cameraY = await page.evaluate(
                () => window.__ratataGameDebug?.worldToPage({ x: 0, y: 0 })?.y
            )
            const shift =
                cameraY === undefined || previousY === undefined
                    ? Infinity
                    : Math.abs(cameraY - previousY)
            previousY = cameraY
            return shift
        })
        .toBeLessThan(0.25)
    return captureStars(page, side)
}

function captureStars(page: Page, side: 'west' | 'east') {
    return page.evaluate(async (edge) => {
        const debug = window.__ratataGameDebug!
        const imageUrl = (await debug.captureFrame!())!
        const width = window.__ratataTest!.getState().location!.map.worldWidth
        const boundary = debug.worldToPage({ x: edge === 'west' ? 0 : width, y: 0 })!
        const bounds = document.querySelector('[data-game-canvas]')!.getBoundingClientRect()
        const frame = await createImageBitmap(await (await fetch(imageUrl)).blob())
        const capture = new OffscreenCanvas(frame.width, frame.height)
        const context = capture.getContext('2d')!
        context.drawImage(frame, 0, 0)
        frame.close()
        const boundaryX = Math.round(((boundary.x - bounds.x) * capture.width) / bounds.width)
        const left = edge === 'west' ? 0 : boundaryX
        const right = edge === 'west' ? boundaryX : capture.width
        const terrainY = ((boundary.y - bounds.y) * capture.height) / bounds.height
        if (left < 0 || right > capture.width || left >= right) return { terrainY, stars: [] }

        const pixels = context.getImageData(left, 0, right - left, capture.height)
        const shadeAt = (x: number, y: number) => {
            if (x < 0 || y < 0) return 0
            const index = (y * pixels.width + x) * 4
            const red = pixels.data[index]
            const green = pixels.data[index + 1]
            const blue = pixels.data[index + 2]
            if (red === 56 && green === 71 && blue === 70) return 1
            if (red === 129 && green === 144 && blue === 142) return 2
            return 0
        }
        const stars: Array<Vector2 & { shade: number }> = []
        for (let y = 0; y < pixels.height; y++) {
            for (let x = 0; x < pixels.width; x++) {
                const shade = shadeAt(x, y)
                if (shade && !shadeAt(x - 1, y) && !shadeAt(x, y - 1))
                    stars.push({ x: x + left, y, shade })
            }
        }
        return { terrainY, stars }
    }, side)
}
