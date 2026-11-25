import { expect, type Page, test } from '@playwright/test'

import { joinSocial } from './social-helpers'

const resumeStoragePrefix = 'ratata:character-resume:'

test('reloads into the same character and keeps explicit leave as a manual exit', async ({
    page,
}) => {
    test.setTimeout(60_000)
    const name = 'reload-hero'
    await page.goto('/?test=1')
    await page.getByRole('radio', { name: 'Следопыт', exact: true }).check()
    await enterByName(page, name)
    await waitForWorld(page)
    const original = await playerState(page)
    const hotbar = page.getByLabel('Быстрые действия')
    const slot = hotbar.getByRole('button', { name: /^2:/u })
    await hotbar.getByRole('button', { name: 'Очистить слот 2', exact: true }).click()
    await expect(slot).toHaveAccessibleName(/^2: Пусто/u)
    await page.reload()
    await waitForWorld(page)
    expect(await playerState(page)).toEqual(original)
    await expect(slot).toHaveAccessibleName(/^2: Пусто/u)

    await leaveWorld(page)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
    await expect(page.locator('canvas[data-game-canvas]')).toHaveCount(0)
    await enterByName(page, name)
    await waitForWorld(page)
    expect(await playerState(page)).toEqual(original)
    await expect(slot).toHaveAccessibleName(/^2: Пусто/u)
})

test('an overlapping tab keeps the active character connected and retries only with ownership', async ({
    page,
    context,
}) => {
    test.setTimeout(60_000)
    const name = 'reload-overlap'
    await joinSocial(page, name)
    const original = await playerState(page)
    const duplicate = context.waitForEvent('page')
    await page.evaluate(() => {
        window.open(window.location.href)
    })
    const other = await duplicate
    try {
        await expect(other.getByRole('alert')).toHaveText(/Персонаж уже подключён/u, {
            timeout: 15_000,
        })
        expect(await page.evaluate(() => window.__ratataTest!.getState().connected)).toBe(true)
        expect(await playerState(page)).toEqual(original)
        await page.close()

        await enterByName(other, name)
        await waitForWorld(other)
        expect(await playerState(other)).toEqual(original)
    } finally {
        await other.close()
    }
})

test('rejects a stale credential without creating or taking over another character', async ({
    page,
    browser,
    baseURL,
}) => {
    test.setTimeout(60_000)
    const name = 'reload-stale'
    await joinSocial(page, name)
    await page.evaluate(
        ({ prefix, name }) => {
            const key = Object.keys(localStorage).find(
                (entry) => entry.startsWith(prefix) && entry.endsWith(`:token:${name}`)
            )
            if (!key) throw new Error('No saved character credential')
            localStorage.setItem(key, 'A'.repeat(43))
        },
        { prefix: resumeStoragePrefix, name }
    )
    await page.reload()
    await expect(page.getByRole('alert')).toHaveText(/Не удалось восстановить персонажа/u, {
        timeout: 15_000,
    })
    await expect(page.locator('canvas[data-game-canvas]')).toHaveCount(0)

    const stranger = await browser.newContext({ baseURL })
    try {
        const otherPage = await stranger.newPage()
        await otherPage.goto('/?test=1')
        await enterByName(otherPage, name)
        await expect(otherPage.getByRole('alert')).toHaveText(/Это имя уже занято/u)
        await expect(otherPage.locator('canvas[data-game-canvas]')).toHaveCount(0)
    } finally {
        await stranger.close()
    }

    await page.reload()
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
})

async function waitForWorld(page: Page): Promise<void> {
    await page.waitForFunction(() => window.__ratataTest?.getState().mapReady)
    await expect(page.locator('canvas[data-game-canvas]')).toBeVisible()
}

async function enterByName(page: Page, name: string): Promise<void> {
    await page.getByRole('textbox', { name: 'Имя героя', exact: true }).fill(name)
    await page.getByRole('button', { name: 'Войти', exact: true }).click()
}

async function leaveWorld(page: Page): Promise<void> {
    await page.locator('canvas[data-game-canvas]').focus()
    await page.keyboard.press('Escape')
    await page
        .getByRole('dialog', { name: 'Игровое меню', exact: true })
        .getByRole('button', { name: 'Выйти из игры', exact: true })
        .click()
    await expect(page.getByRole('textbox', { name: 'Имя героя', exact: true })).toBeVisible()
}

async function playerState(page: Page) {
    return page.evaluate(() => {
        const { player, location } = window.__ratataTest!.getState()
        if (!player) throw new Error('No local character')
        return {
            id: player.id,
            heroClass: player.heroClass,
            inventory: player.inventory,
            equipment: player.equipment,
            location: location?.id,
            sky: player.progression?.constellations?.layout,
        }
    })
}
