import { expect, test } from '@playwright/test'

for (const motion of ['no-preference', 'reduce'] as const) {
    test(`a patron omen uses the earned name cue with motion ${motion}`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: motion })
        await page.addInitScript(() => {
            const events: string[] = []
            for (const type of ['animationstart', 'animationiteration', 'animationend']) {
                document.addEventListener(type, (event) => {
                    if (
                        !(event.target instanceof Element) ||
                        !event.target.matches('[data-mood-change-id]')
                    )
                        return
                    const elapsed = (event as AnimationEvent).elapsedTime
                    events.push(`${type}:${Math.round(elapsed * 1000)}`)
                    document.documentElement.dataset.omenAnimationEvents = events.join(',')
                })
            }
        })
        await page.goto(
            '/iframe.html?id=entities-player-effects-faithstatus--mood-changed&viewMode=story'
        )
        const faith = page.getByLabel('Покровитель и развитие')
        await expect(faith.getByText('Угольная Мать', { exact: true })).toBeVisible()
        await expect(faith.locator('[data-patron-mood]')).toHaveCount(0)
        await expect(faith.locator('.faith-status__chances, .faith-status__timer')).toHaveCount(0)
        await expect(page.locator('html')).toHaveAttribute(
            'data-omen-animation-events',
            motion === 'reduce'
                ? 'animationstart:0,animationend:480'
                : 'animationstart:0,animationiteration:240,animationend:480'
        )
    })
}
