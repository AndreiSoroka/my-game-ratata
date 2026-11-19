import type { Locator } from '@playwright/test'

export type ScreenshotPixels = {
    width: number
    height: number
    pixels: number[]
}

/** Inspect actual screenshot PNG output using the browser's native PNG decoder. */
export async function readScreenshotPixels(locator: Locator): Promise<ScreenshotPixels> {
    const screenshot = await locator.screenshot({ animations: 'disabled', scale: 'css' })
    return locator.page().evaluate(async (encoded) => {
        const image = new Image()
        image.src = `data:image/png;base64,${encoded}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('A 2D canvas is required to inspect screenshot pixels')
        }
        context.drawImage(image, 0, 0)
        return {
            width: canvas.width,
            height: canvas.height,
            pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
        }
    }, screenshot.toString('base64'))
}

export function screenshotPixel(image: ScreenshotPixels, x: number, y: number): number[] {
    const offset = (y * image.width + x) * 4
    return image.pixels.slice(offset, offset + 4)
}

export function screenshotCorner(image: ScreenshotPixels, size: number): number[] {
    const pixels: number[] = []
    for (let y = 0; y < size; y += 1) {
        const offset = y * image.width * 4
        pixels.push(...image.pixels.slice(offset, offset + size * 4))
    }
    return pixels
}
