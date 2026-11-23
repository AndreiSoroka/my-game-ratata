import { expect, type Locator, type Page, test } from '@playwright/test'

const sources = [
    { name: 'Mystic Woods', url: 'https://game-endeavor.itch.io/mystic-woods' },
    { name: 'Kenney', url: 'https://kenney.nl/' },
    { name: 'GitHub', url: 'https://github.com/AndreiSoroka/my-game-ratata' },
]
const creditOrigins = new Set(sources.map(({ url }) => new URL(url).origin))
const creditsName = 'Ссылки проекта'

test('asset credits sit at the bottom left of the desktop start screen', async ({ page }) => {
    const { credits, bounds, formBounds } = await openCredits(page, 1280)
    await expect(credits).toBeInViewport({ ratio: 1 })
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(formBounds.x)
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(800 - 96)
})

test('asset credits are centered under the join form on a narrow screen', async ({ page }) => {
    const width = 320
    const { credits, bounds, formBounds } = await openCredits(page, width)
    expect(bounds.y).toBeGreaterThanOrEqual(formBounds.y + formBounds.height)
    expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0)
    await credits.scrollIntoViewIfNeeded()
    await expect(credits).toBeInViewport({ ratio: 1 })
})

test('credit badges brighten individually on hover and respect reduced motion', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const links = creditLinks(await openStartPage(page))
    for (const { badge } of links) {
        await expect(badge).toHaveCSS('opacity', '0.58')
        await expect(badge).toHaveCSS('transition-property', 'opacity')
        await expect(badge).toHaveCSS('transition-duration', '0.18s')
    }

    for (const { link, badge } of links) {
        await link.hover()
        await expect(link).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expectBadgeHighlight(links, badge)
    }

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('heading', { name: 'Ratata', exact: true }).hover()
    for (const { badge } of links) {
        await expect(badge).toHaveCSS('transition-duration', '0s')
        await expect(badge).toHaveCSS('opacity', '0.58')
    }
})

test('credit links open from the keyboard with no referrer or window opener', async ({
    context,
    page,
}) => {
    const requests: { url: string; method: string; referer?: string; body: string | null }[] = []
    await context.route(
        (url) => creditOrigins.has(url.origin),
        async (route) => {
            const request = route.request()
            const headers = await request.allHeaders()
            requests.push({
                url: request.url(),
                method: request.method(),
                referer: headers['referer'],
                body: request.postData(),
            })
            await route.fulfill({ contentType: 'text/html', body: '<title>Asset source</title>' })
        }
    )
    const links = creditLinks(await openStartPage(page))
    const startUrl = page.url()
    for (const { badge } of links) {
        await expectLocalBadge(badge)
    }
    expect(requests).toHaveLength(0)

    await page.getByRole('radio', { name: 'Авангард', exact: true }).focus()
    for (const { link, badge, url } of links) {
        await page.keyboard.press('Tab')
        await expect(link).toBeFocused()
        await expectBadgeHighlight(links, badge)
        await openCreditLink(page, url)
        await page.bringToFront()
        await link.focus()
    }

    await expect(page).toHaveURL(startUrl)
    await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
    expect(requests).toEqual(
        sources.map(({ url }) => ({ url, method: 'GET', referer: undefined, body: null }))
    )
})

async function openCredits(page: Page, width: number) {
    await page.setViewportSize({ width, height: 800 })
    const credits = await openStartPage(page)
    const form = page.locator('.join-panel')
    await expect(credits.getByRole('link')).toHaveCount(sources.length)
    await expect(form).toBeVisible()
    for (const { badge } of creditLinks(credits)) {
        await expectLocalBadge(badge)
    }

    const bounds = (await credits.boundingBox())!
    const formBounds = (await form.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
    )
    return { credits, bounds, formBounds }
}

async function openStartPage(page: Page): Promise<Locator> {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Ratata', exact: true })).toBeVisible({
        timeout: 15_000,
    })
    return page.getByRole('navigation', { name: creditsName })
}

function creditLinks(credits: Locator) {
    return sources.map(({ name, url }) => {
        const link = credits.getByRole('link', { name, exact: true })
        return { link, badge: link.locator('img'), url }
    })
}

async function expectBadgeHighlight(links: ReturnType<typeof creditLinks>, active: Locator) {
    for (const { badge } of links) {
        await expect(badge).toHaveCSS('opacity', badge === active ? '1' : '0.58')
    }
}

async function expectLocalBadge(badge: Locator): Promise<void> {
    await expect(badge).toBeVisible()
    await expect
        .poll(() =>
            badge.evaluate((image: HTMLImageElement) => {
                const url = new URL(image.currentSrc, location.href)
                return (
                    image.naturalWidth > 0 &&
                    (url.origin === location.origin || url.protocol === 'data:')
                )
            })
        )
        .toBe(true)
}

async function openCreditLink(page: Page, url: string): Promise<void> {
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('Enter')])
    await expect(popup).toHaveURL(url)
    await expect(popup).toHaveTitle('Asset source')
    expect(await popup.evaluate(() => window.opener === null)).toBe(true)
    expect(await popup.evaluate(() => document.referrer)).toBe('')
    await popup.close()
}
