import process from 'node:process'

import type { ClientMessage, ServerMessage } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

type JoinCommand = Extract<ClientMessage, { type: 'join' }>

for (const width of [320, 390, 1280]) {
    test(`suggests a fantasy name and preserves the accepted identity at ${width}px`, async ({
        page,
    }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 844 })
        const joins = captureJoins(page)
        await page.goto('/?test=1')
        await page.addStyleTag({
            content: '.test-panel, #vue-devtools__anchor { display: none !important }',
        })
        const input = page.getByRole('textbox', { name: 'Имя героя', exact: true })
        const submit = page.getByRole('button', { name: 'Войти', exact: true })
        const regenerate = page.getByRole('button', {
            name: 'Сгенерировать другое имя',
            exact: true,
        })
        await expect(page.locator('html')).toHaveAttribute('lang', 'ru')
        await expect(page.locator('.join-panel')).toHaveAttribute('autocomplete', 'off')
        await expect(input).toHaveAttribute('autocomplete', 'off')
        await expect(input).toHaveAttribute('maxlength', '24')
        await expect(regenerate).toHaveAttribute('type', 'button')
        await expect(input).not.toHaveValue('')
        const first = await input.inputValue()
        expect(first.trim().length).toBeGreaterThan(0)
        expect(first.length).toBeLessThanOrEqual(24)
        await expect(submit).toBeEnabled()
        await regenerate.click()
        await expect(input).not.toHaveValue(first)
        const chosen = await input.inputValue()
        expect(chosen.trim().length).toBeGreaterThan(0)
        expect(chosen.length).toBeLessThanOrEqual(24)
        expect(joins).toHaveLength(0)
        await assertNameControlsFit(page, width)
        await page.screenshot({
            path: info.outputPath(`generated-name-${width}.png`),
            fullPage: true,
        })
        await submit.click()
        const created = await currentPlayer(page)
        expect(created.nickname).toBe(chosen)
        expect(joins.at(-1)).toMatchObject({ nickname: chosen, createOnly: true })
        await leave(page)
        await expect(input).toHaveValue(chosen)
        await submit.click()
        const resumed = await currentPlayer(page)
        expect(resumed.id).toBe(created.id)
        expect(joins.at(-1)?.createOnly).not.toBe(true)
        await leave(page)
        const manual = `Ручной ${width}`
        await input.fill(manual)
        await submit.click()
        const renamed = await currentPlayer(page)
        expect(renamed.nickname).toBe(manual)
        expect(renamed.id).not.toBe(created.id)
        expect(joins.at(-1)?.createOnly).not.toBe(true)
    })
}

test('does not take over a protected namesake when active or disconnected', async ({ page }) => {
    test.setTimeout(60_000)
    const joins = captureJoins(page)
    await page.goto('/?test=1')
    const input = page.getByRole('textbox', { name: 'Имя героя', exact: true })
    const submit = page.getByRole('button', { name: 'Войти', exact: true })
    await expect(input).not.toHaveValue('')
    const suggested = await input.inputValue()
    const guest = await connectGuest(suggested)
    try {
        await submit.click()
        const collision = page.getByRole('alert')
        await expect(collision).toHaveText(
            'Это имя уже занято. Сгенерируйте другое или введите своё'
        )
        await expect(collision).toBeVisible()
        expect(joins.at(-1)).toMatchObject({ nickname: suggested, createOnly: true })
        await expect(input).toHaveValue(suggested)
        await expect(page.locator('canvas[data-game-canvas=true]')).toHaveCount(0)

        await closeGuest(guest.socket)
        await submit.click()
        await expect.poll(() => joins.length).toBe(2)
        await expect(collision).toBeVisible()
        expect(joins.at(-1)).toMatchObject({ nickname: suggested, createOnly: true })
        await expect(page.locator('canvas[data-game-canvas=true]')).toHaveCount(0)

        await input.fill(suggested.toLocaleUpperCase('ru-RU'))
        await expect(collision).toHaveCount(0)
        await submit.click()
        await expect(collision).toBeVisible()
        expect(joins.at(-1)?.createOnly).not.toBe(true)
        await expect(page.locator('canvas[data-game-canvas=true]')).toHaveCount(0)

        await page.getByRole('button', { name: 'Сгенерировать другое имя', exact: true }).click()
        await expect(input).not.toHaveValue(suggested)
        const next = await input.inputValue()
        await submit.click()
        const created = await currentPlayer(page)
        expect(created.id).not.toBe(guest.playerId)
        expect(created.nickname).toBe(next)
        expect(joins.at(-1)).toMatchObject({ nickname: next, createOnly: true })
    } finally {
        await closeGuest(guest.socket)
    }
})

function connectGuest(nickname: string): Promise<{ socket: WebSocket; playerId: string }> {
    const socket = new WebSocket(`ws://127.0.0.1:${process.env['E2E_BACKEND_PORT'] ?? '3500'}/ws`)
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.close()
            reject(new Error('Guest join did not receive a world snapshot'))
        }, 5_000)
        const receive = ({ data }: MessageEvent) => {
            const message = JSON.parse(String(data)) as ServerMessage
            if (message.type === 'world_init') {
                clearTimeout(timer)
                socket.removeEventListener('message', receive)
                resolve({ socket, playerId: message.playerId })
            } else if (message.type === 'error') {
                clearTimeout(timer)
                socket.close()
                reject(new Error(message.message))
            }
        }
        socket.addEventListener('message', receive)
        socket.addEventListener('open', () =>
            socket.send(
                JSON.stringify({
                    type: 'join',
                    nickname,
                    heroClass: 'vanguard',
                    requestResumeToken: true,
                })
            )
        )
    })
}

async function closeGuest(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.CLOSED) return
    await new Promise<void>((resolve) => {
        socket.addEventListener('close', () => resolve(), { once: true })
        socket.close()
    })
}

function captureJoins(page: Page): JoinCommand[] {
    const joins: JoinCommand[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framesent', (frame) => {
            if (typeof frame.payload !== 'string') return
            const message = JSON.parse(frame.payload) as ClientMessage
            if (message.type === 'join') {
                delete message.resumeToken
                joins.push(message)
            }
        })
    })
    return joins
}

async function currentPlayer(page: Page) {
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().connected))
        .toBe(true)
    return page.evaluate(() => window.__ratataTest!.getState().player!)
}

async function leave(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Игровое меню', exact: true }).click()
    await page
        .getByRole('dialog', { name: 'Игровое меню', exact: true })
        .getByRole('button', { name: 'Выйти из игры', exact: true })
        .click()
    await expect(page.getByRole('textbox', { name: 'Имя героя', exact: true })).toBeVisible()
    await expect(page.locator('canvas[data-game-canvas=true]')).toHaveCount(0)
}

async function assertNameControlsFit(page: Page, width: number): Promise<void> {
    const controls = await page.locator('.join-row').evaluate((row) =>
        [...row.querySelectorAll('input, button')].map((control) => {
            const { x, width } = control.getBoundingClientRect()
            return { x, width }
        })
    )
    expect(controls).toHaveLength(3)
    expect(controls.every((control) => control.x >= 0 && control.x + control.width <= width)).toBe(
        true
    )
}
