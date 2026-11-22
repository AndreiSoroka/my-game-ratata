import { expect, type Locator, type Page, test } from '@playwright/test'

import { readyUiStory } from './ui-story-ready'

async function openJoinPanel(page: Page): Promise<Locator> {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/iframe.html?id=game-joingamepanel--ready&viewMode=story')
    const panel = page.locator('.join-panel')
    await expect(panel.getByRole('radio', { name: 'Авангард' })).toBeChecked()
    await readyUiStory(page)
    return panel
}

async function sampleClassChange(panel: Locator, heroClass: string, finish = true) {
    return panel.evaluate(
        async (element, { heroClass, finish }) => {
            const frame = element.querySelector(':scope > .game-frame')!
            const ornament = frame.querySelector('feFlood[result="border-color"]')!
            function measure() {
                return {
                    height: element.getBoundingClientRect().height,
                    fill: getComputedStyle(frame, '::after').backgroundImage,
                    ornament: getComputedStyle(ornament).floodColor,
                }
            }
            const nextPaint = () =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
                )
            const start = measure()
            const radio = element.querySelector<HTMLInputElement>(`input[value="${heroClass}"]`)!
            radio.focus({ preventScroll: true })
            radio.click()
            await nextPaint()

            const animations = element.getAnimations()
            const properties = animations.flatMap((animation) => {
                if (animation instanceof CSSTransition) return [animation.transitionProperty]
                if (animation.effect instanceof KeyframeEffect) {
                    return animation.effect.getKeyframes().some((frame) => 'height' in frame)
                        ? ['height']
                        : []
                }
                return []
            })
            for (const animation of animations) {
                animation.pause()
                animation.currentTime = 0
            }
            const originHeight = element.getBoundingClientRect().height
            for (const animation of animations) {
                animation.currentTime = animation.effect!.getComputedTiming().activeDuration / 2
            }
            const middle = measure()
            if (finish) {
                for (const animation of animations) animation.finish()
                await nextPaint()
            }
            return {
                start,
                middle,
                end: measure(),
                originHeight,
                properties,
                inlineHeight: (element as HTMLElement).style.height,
                remainingAnimations: element.getAnimations().length,
            }
        },
        { heroClass, finish }
    )
}

test('join panel interpolates the frame colors and natural height when the class changes', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const panel = await openJoinPanel(page)
    const grow = await sampleClassChange(panel, 'cleric')

    expect(grow.properties).toEqual(
        expect.arrayContaining(['--join-panel-surface', '--join-panel-accent', 'height'])
    )
    expect(grow.originHeight).toBeCloseTo(grow.start.height)
    expect(grow.middle.height).toBeGreaterThan(grow.start.height)
    expect(grow.middle.height).toBeLessThan(grow.end.height)
    expect(grow.middle.fill).not.toBe(grow.start.fill)
    expect(grow.middle.fill).not.toBe(grow.end.fill)
    expect(grow.middle.ornament).not.toBe(grow.start.ornament)
    expect(grow.middle.ornament).not.toBe(grow.end.ornament)
    expect(grow.inlineHeight).toBe('')
    expect(grow.remainingAnimations).toBe(0)
    const cleric = panel.getByRole('radio', { name: 'Клирик' })
    await expect(cleric).toBeChecked()
    await expect(cleric).toBeFocused()

    const interrupted = await sampleClassChange(panel, 'vanguard', false)
    expect(interrupted.middle.height).toBeLessThan(grow.end.height)
    expect(interrupted.middle.height).toBeGreaterThan(grow.start.height)
    const resumed = await sampleClassChange(panel, 'cleric')
    expect(resumed.originHeight).toBeCloseTo(interrupted.middle.height)
    expect(resumed.middle.height).toBeGreaterThan(resumed.start.height)
    expect(resumed.middle.height).toBeLessThan(grow.end.height)
    expect(resumed.end).toEqual(grow.end)
    expect(resumed.remainingAnimations).toBe(0)
    await expect(cleric).toBeChecked()
})

test('join panel applies the new class without motion when reduced motion is requested', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const panel = await openJoinPanel(page)
    const change = await sampleClassChange(panel, 'cleric', false)

    expect(change.properties).toEqual([])
    expect(change.remainingAnimations).toBe(0)
    expect(change.end.height).toBeGreaterThan(change.start.height)
    expect(change.end.fill).not.toBe(change.start.fill)
    expect(change.end.ornament).not.toBe(change.start.ornament)
    await expect(panel.getByRole('radio', { name: 'Клирик' })).toBeChecked()
})
