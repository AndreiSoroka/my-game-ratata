import { expect, test } from '@playwright/test'

test('stops an AI click path and stays still over subsequent authoritative ticks', async ({
    page,
}) => {
    test.setTimeout(60_000)
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(
        (name) => window.__ratataTest!.join(name, 'ranger'),
        `stop-${Date.now().toString(36)}`
    )
    const initial = await page.evaluate(() => {
        const observation = window.__ratataTest!.observe()
        const exit = observation.exits.find((candidate) => candidate.direction === 'north')
        if (!exit) throw new Error('No observed north exit')
        return { position: observation.player!.position, destination: exit.position }
    })
    const navigation = page.evaluate(
        (destination) => window.__ratataTest!.navigate(destination, { timeoutMs: 30_000 }),
        initial.destination
    )
    await page.waitForFunction((start) => {
        const player = window.__ratataTest!.getState().player!
        return (
            player.path.length > 0 &&
            Math.hypot(player.position.x - start.x, player.position.y - start.y) > 16
        )
    }, initial.position)
    await page.evaluate(() => window.__ratataTest!.stop())
    expect((await navigation).status).toBe('cancelled')
    const idle = await page.evaluate(() =>
        window.__ratataTest!.waitFor({ type: 'idle' }, { timeoutMs: 2_000 })
    )
    expect(idle.status).toBe('condition_met')
    const stopped = idle.observation
    const later = await page.evaluate(
        (after) => window.__ratataTest!.waitFor({ type: 'tick', after }, { timeoutMs: 2_000 }),
        stopped.tick! + 19
    )
    expect(later.status).toBe('condition_met')
    expect(later.observation.player!.position).toEqual(stopped.player!.position)
    expect(later.observation.player!.path).toEqual([])
    expect(later.observation.player!.velocity).toEqual({ x: 0, y: 0 })
    expect(
        Math.hypot(
            stopped.player!.position.x - initial.destination.x,
            stopped.player!.position.y - initial.destination.y
        )
    ).toBeGreaterThan(200)
})
