import { expect, type Page, test } from '@playwright/test'

async function openStoryCanvas(page: Page, storyId: string, args: string): Promise<void> {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story&args=${args}`)
    await page.locator('canvas[data-gallery-ready="true"]').waitFor({ state: 'visible' })
    await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas')

        if (!(canvas instanceof HTMLCanvasElement)) {
            return false
        }

        const context = canvas.getContext('2d')

        if (context === null) {
            return false
        }

        const data = context.getImageData(0, 0, canvas.width, canvas.height).data

        for (let index = 3; index < data.length; index += 4) {
            if (data[index] !== 0) {
                return true
            }
        }

        return false
    })
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
})
