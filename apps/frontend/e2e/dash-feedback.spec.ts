import type { GameEventPayload, ServerMessage } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

declare global {
    interface Window {
        __dashCaptions?: Set<string>
    }
}

const cooldownCaption = /^Рывок: ещё \d+ с\.$/
const energyCaption = 'Не хватает энергии'

for (const [viewport, size] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 320, height: 760 }],
] as const) {
    test(`shows dash failures over the player (${viewport})`, async ({ page }, info) => {
        test.setTimeout(60_000)
        const rejections = await observeDashFeedback(page)
        await page.setViewportSize(size)
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate((name) => window.__ratataTest!.join(name, 'cleric'), `dash-${viewport}`)
        await page.waitForFunction(() => window.__ratataTest?.getState().mapReady === true)
        await page.locator('canvas[data-game-canvas=true]').focus()
        const playerId = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        expect(playerId).toBeTruthy()

        await page.keyboard.press('Space')
        await page.waitForFunction(() => {
            const movement = window.__ratataTest!.getState().player?.movement
            return (movement?.dashCooldownMsLeft ?? 0) > 0
        })
        await page.keyboard.press('Space')
        await expect.poll(() => rejections[0]?.text).toMatch(cooldownCaption)
        await expectCaption(page, rejections[0]!.text!)
        await page.screenshot({ path: info.outputPath('dash-cooldown.png') })

        // Consecutive ordinary dashes spend energy faster than passive regeneration.
        await dashUntilEnergyRejection(page)
        await expect.poll(() => rejections[1]?.text).toBe(energyCaption)
        await expectCaption(page, energyCaption)
        await page.screenshot({ path: info.outputPath('dash-energy.png') })

        expect(rejections.map((event) => event.actorId)).toEqual([playerId, playerId])
        await expect(page.locator('.prayer-preview')).toHaveCount(0)
    })
}

async function observeDashFeedback(page: Page): Promise<GameEventPayload[]> {
    const rejections: GameEventPayload[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            if (typeof payload !== 'string') return
            const message = JSON.parse(payload) as ServerMessage
            if (message.type === 'event' && message.event.noticeKind === 'dash_rejected') {
                rejections.push(message.event)
            }
        })
    })
    // Excalibur rasterizes its Font into a 2D canvas before drawing the label to WebGL.
    await page.addInitScript(() => {
        const captions = new Set<string>()
        window.__dashCaptions = captions
        const fillText = CanvasRenderingContext2D.prototype.fillText
        CanvasRenderingContext2D.prototype.fillText = function (...args) {
            fillText.apply(this, args)
            captions.add(args[0])
        }
    })
    return rejections
}

async function expectCaption(page: Page, caption: string): Promise<void> {
    await expect
        .poll(() => page.evaluate((text) => window.__dashCaptions?.has(text), caption))
        .toBe(true)
    await expect(page.locator('.game-notice')).toHaveCount(0)
}

async function dashUntilEnergyRejection(page: Page): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
        const check = await page.waitForFunction(() => {
            const api = window.__ratataTest!
            const player = api.getState().player
            if (player?.movement?.dashCooldownMsLeft !== 0) return
            const dash = player.resourceChecks?.dash
            if (dash !== 'ready' && dash !== 'energy') return
            api.send({ type: 'dash' })
            return dash
        })
        if ((await check.jsonValue()) === 'energy') return
        await page.waitForFunction(() => {
            const movement = window.__ratataTest!.getState().player?.movement
            return (movement?.dashCooldownMsLeft ?? 0) > 0
        })
    }
    throw new Error('Consecutive dashes did not exhaust the player')
}
