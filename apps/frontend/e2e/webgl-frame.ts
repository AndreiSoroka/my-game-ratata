import { expect, type Locator, type Page } from '@playwright/test'

export async function recordWebGLErrors(page: Page): Promise<string[]> {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
        if (message.type() === 'error' || /too many active webgl/i.test(message.text()))
            errors.push(message.text())
    })
    await page.addInitScript(() => {
        document.addEventListener(
            'webglcontextlost',
            (event) => {
                if (event.target instanceof HTMLCanvasElement && event.target.isConnected)
                    console.error('WebGL context lost on a mounted canvas')
            },
            true
        )
    })
    return errors
}

export async function expectWebGLFrame(canvas: Locator): Promise<void> {
    await expect(canvas).toBeVisible()
    expect(
        await canvas.evaluate((element) => {
            if (!(element instanceof HTMLCanvasElement)) return false
            const gl = element.getContext('webgl2')
            return (
                gl !== null &&
                !gl.isContextLost() &&
                !gl.getContextAttributes()?.preserveDrawingBuffer
            )
        })
    ).toBe(true)
    // Read the composited frame instead of the engine's discarded drawing buffer.
    const image = await canvas.screenshot({ scale: 'css' })
    const colorCount = await canvas.page().evaluate(async (png) => {
        const image = new Image()
        image.src = `data:image/png;base64,${png}`
        await image.decode()
        const capture = new OffscreenCanvas(image.width, image.height)
        const ctx = capture.getContext('2d')!
        ctx.drawImage(image, 0, 0)
        const { data } = ctx.getImageData(0, 0, image.width, image.height)
        const colors = new Set<number>()
        for (let index = 0; index < data.length && colors.size < 16; index += 4) {
            colors.add((data[index]! << 16) | (data[index + 1]! << 8) | data[index + 2]!)
        }
        return colors.size
    }, image.toString('base64'))
    expect(colorCount).toBeGreaterThan(8)
}
