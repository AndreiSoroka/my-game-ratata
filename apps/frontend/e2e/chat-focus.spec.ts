import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { expect, type Locator, type Page, test } from '@playwright/test'

interface CityMap {
    tilewidth: number
    layers: {
        name: string
        objects?: {
            type?: string
            x: number
            y: number
            width: number
            height: number
            properties?: { name: string; value: unknown }[]
        }[]
    }[]
}

for (const mobile of [false, true]) {
    test(`returns from chat reading and typing to movement (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        const cityMap = page.waitForResponse((response) => {
            const path = new URL(response.url()).pathname
            return path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
        })
        await page.evaluate(
            (name) => window.__ratataTest!.join(name),
            `chat-focus-${info.workerIndex}-${mobile}`
        )
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().connected))
            .toBe(true)
        await stageOnPlaza(page, (await (await cityMap).json()) as CityMap)
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        const canvas = page.locator('canvas[data-game-canvas]')
        const history = page.getByRole('list', { name: 'Услышанные реплики' })
        const draft = page.getByRole('textbox', { name: 'Сообщение в чат' })
        await history.focus()
        await moveRight(page)
        await page.getByRole('button', { name: 'Рядом', exact: true }).focus()
        await moveRight(page)
        await history.focus()
        await page.keyboard.press('KeyQ')
        await page.keyboard.press('KeyF')
        await page.keyboard.press('Digit1')
        await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
        await page.evaluate(() =>
            window.__ratataTest!.send({
                type: 'chat',
                text: Array.from({ length: 20 }, (_, index) => `Строка ${index}`).join('\n'),
            })
        )
        await expect
            .poll(() => history.evaluate((element) => element.scrollHeight > element.clientHeight))
            .toBe(true)
        await history.focus()
        const scrollBefore = await history.evaluate((element) => element.scrollTop)
        const readingAt = await position(page)
        await page.keyboard.press('ArrowUp')
        await expect
            .poll(() => history.evaluate((element) => element.scrollTop))
            .toBeLessThan(scrollBefore)
        await settled(page)
        expect(await position(page)).toEqual(readingAt)

        await canvas.focus()
        await page.keyboard.press('Enter')
        await expect(draft).toBeFocused()
        await page.keyboard.insertText('Привет ')
        await page.keyboard.type('first drat')
        await page.keyboard.press('ArrowLeft')
        await page.keyboard.insertText('f')
        await page.keyboard.press('ArrowRight')
        await expect(draft).toHaveValue('Привет first draft')
        await expectDraftClearOfHotbar(page, draft)
        const typingAt = await position(page)
        await page.keyboard.press('KeyW')
        await settled(page)
        expect(await position(page)).toEqual(typingAt)
        await expect(draft).toHaveValue('Привет first draftw')
        await page.keyboard.press('KeyQ')
        await page.keyboard.press('Digit1')
        await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
        await expect(draft).toHaveValue('Привет first draftwq1')
        await page.keyboard.down('Enter')
        await page.keyboard.down('Enter')
        await expect(draft).toHaveCount(0)
        await page.keyboard.up('Enter')
        await expect(canvas).toBeFocused()
        await moveRight(page)
        await expect(
            history.getByRole('listitem').filter({ hasText: /^Вы:\s*Привет first draftwq1$/ })
        ).toHaveCount(1)

        await page.keyboard.press('Enter')
        await page.keyboard.type('keep draft')
        const beforeClick = await position(page)
        const bounds = await canvas.boundingBox()
        await canvas.click({ position: { x: bounds!.width * 0.85, y: bounds!.height * 0.4 } })
        await expect(draft).toHaveCount(0)
        await expect(canvas).toBeFocused()
        await settled(page)
        expect(await position(page)).toEqual(beforeClick)
        await moveRight(page)
        await page.keyboard.press('Enter')
        await expect(draft).toBeFocused()
        await expect(draft).toHaveValue('keep draft')
        await history.focus()
        await page.keyboard.press('Escape')
        await expect(draft).toHaveCount(0)
        await expect(canvas).toBeFocused()
        await moveRight(page)
        await page.keyboard.press('Enter')
        await expect(draft).toHaveValue('')
        await page.keyboard.press('Escape')

        await page.keyboard.press('KeyI')
        await expect(page.getByRole('dialog', { name: 'Inventory and equipment' })).toBeVisible()
        const modalAt = await position(page)
        await history.focus()
        await page.keyboard.press('KeyD')
        await settled(page)
        expect(await position(page)).toEqual(modalAt)
        await page.keyboard.press('Escape')
    })
}

async function expectDraftClearOfHotbar(page: Page, draft: Locator): Promise<void> {
    await expect(draft).toBeInViewport({ ratio: 1 })
    await draft.click({ trial: true })
    const hotbar = page.getByRole('group', { name: 'Быстрые действия' })
    await expect(hotbar).toBeVisible()
    await expect
        .poll(async () => {
            const [field, bar] = await Promise.all([draft.boundingBox(), hotbar.boundingBox()])
            if (!field || !bar) return false
            return (
                field.x + field.width <= bar.x ||
                bar.x + bar.width <= field.x ||
                field.y + field.height <= bar.y ||
                bar.y + bar.height <= field.y
            )
        })
        .toBe(true)
}

async function stageOnPlaza(page: Page, map: CityMap): Promise<void> {
    const plaza = map.layers
        .find((layer) => layer.name === 'City anchors')
        ?.objects?.find(
            (object) =>
                object.type === 'city_area' &&
                object.properties?.some(
                    (property) => property.name === 'anchorId' && property.value === 'plaza'
                )
        )
    if (plaza === undefined) throw new Error('Generated city has no authored plaza')
    // Repeated rightward probes need open ground, independent of the grave spawn index.
    const arrived = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { timeoutMs: 20_000, tolerance: 1 }),
        { x: plaza.x + map.tilewidth * 2, y: plaza.y + plaza.height * 0.6 }
    )
    expect(arrived.status, arrived.reason).toBe('arrived')
}

async function position(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().player!.position)
}

async function settled(page: Page): Promise<void> {
    const tick = await page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick)
    await expect
        .poll(() =>
            page.evaluate((before) => {
                const state = window.__ratataTest!.getState()
                return (
                    (state.snapshot?.tick ?? 0) > before + 2 &&
                    state.player?.velocity.x === 0 &&
                    state.player.velocity.y === 0 &&
                    state.player.path.length === 0
                )
            }, tick)
        )
        .toBe(true)
}

async function moveRight(page: Page): Promise<void> {
    const before = await position(page)
    await page.keyboard.down('KeyD')
    try {
        await expect.poll(async () => (await position(page)).x).toBeGreaterThan(before.x)
    } finally {
        await page.keyboard.up('KeyD')
    }
    await settled(page)
}
