import { expect, type Page, test } from '@playwright/test'

import { expectWebGLFrame, recordWebGLErrors } from './webgl-frame'

async function openStoryCanvas(page: Page, storyId: string, args: string): Promise<void> {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story&args=${args}`)
    await expectWebGLFrame(page.locator('canvas[data-gallery-ready="true"]'))
}

test.describe('Storybook character gallery visuals', () => {
    test('all characters overview', async ({ page }) => {
        await openStoryCanvas(
            page,
            'characters-characters--all',
            'action:attack;direction:left;frame:2;animate:false;zoom:2;showFrameGrid:true'
        )

        await expect(page.locator('canvas')).toHaveScreenshot('characters-all.png')
    })

    test('all frames overview', async ({ page }) => {
        await openStoryCanvas(
            page,
            'characters-characters--all-frames',
            'character:skeleton;action:walk;direction:right;zoom:2;showFrameGrid:true'
        )

        await expect(page.locator('canvas')).toHaveScreenshot('characters-all-frames.png')
    })

    test('renders Fat Zombie animations and both side facings', async ({ page }) => {
        test.setTimeout(60_000)
        const errors = await recordWebGLErrors(page)
        for (const [action, direction] of [
            ['idle', 'down'],
            ['walk', 'up'],
            ['attack', 'down'],
            ['attack', 'right'],
            ['attack', 'left'],
            ['attack', 'up'],
            ['damaged', 'down'],
            ['death', 'down'],
        ]) {
            await openStoryCanvas(
                page,
                'characters-characters--all-frames',
                `character:fat_zombie;action:${action};direction:${direction};zoom:2;showFrameGrid:false`
            )
        }
        expect(errors).toEqual([])
    })

    test('renders the last of 25 rapid Controls changes', async ({ page }) => {
        test.setTimeout(60_000)
        const errors = await recordWebGLErrors(page)
        await page.goto('/?path=/story/characters-characters--all-frames')
        const gallery = page.frameLocator('#storybook-preview-iframe')
        const canvas = gallery.locator('canvas[data-gallery-ready="true"]')
        await expect(canvas).toBeVisible()
        const initialWidth = await canvas.getAttribute('width')
        const zoom = page.locator('input#control-zoom')
        for (let index = 0; index < 25; index++)
            await zoom.press(index % 2 === 0 ? 'ArrowRight' : 'ArrowLeft')

        await expect(zoom).toHaveValue('3')
        await expect
            .poll(async () => Number(await canvas.getAttribute('width')))
            .toBeGreaterThan(Number(initialWidth))
        await expect(gallery.locator('canvas')).toHaveCount(1)
        await expectWebGLFrame(canvas)
        expect(errors).toEqual([])
    })

    test('renders the character Docs previews independently', async ({ page }) => {
        test.setTimeout(60_000)
        const errors = await recordWebGLErrors(page)
        await page.goto('/iframe.html?id=characters-characters--docs&viewMode=docs')
        const previews = page.locator('canvas[data-gallery-ready="true"]')
        await expect(previews).toHaveCount(5, { timeout: 20_000 })
        for (const preview of await previews.all()) await expectWebGLFrame(preview)
        expect(errors).toEqual([])
    })

    for (const story of ['ordinary-attack', 'skeleton-strike']) {
        test(`renders ${story} with all four melee directions`, async ({ page }, info) => {
            await page.goto(`/iframe.html?id=combat-melee-directions--${story}&viewMode=story`)
            const canvas = page.locator('canvas[data-gallery-ready="true"]')
            await expectWebGLFrame(canvas)
            for (const direction of ['Вправо', 'Вниз', 'Влево', 'Вверх'])
                await expect(page.getByText(direction, { exact: true })).toBeVisible()
            await canvas.screenshot({ path: info.outputPath(`${story}.png`) })
        })
    }
})
