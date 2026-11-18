import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const directory = path.join(
    root,
    'apps/frontend/public/game/assets/world/memory-bell'
)
const source = path.resolve(
    process.argv[2] ?? path.join(directory, 'source-sheet.png')
)
const require = createRequire(path.join(root, 'apps/frontend/package.json'))
const { chromium } = require('@playwright/test')
const names = [
    'silent',
    'prepared',
    'active',
    'swing-0',
    'swing-1',
    'swing-2',
    'swing-3',
]
const encoded = (await fs.readFile(source)).toString('base64')
const browser = await chromium.launch({ headless: true })
try {
    const page = await browser.newPage()
    const frames = await page.evaluate(
        async ({ encoded, names }) => {
            const source = new Image()
            source.src = `data:image/png;base64,${encoded}`
            await source.decode()
            if (source.width !== 1536 || source.height !== 1024) {
                throw new Error(
                    'Bell master must contain a 4 by 2 grid of 384 by 512 cells'
                )
            }
            return names.map((name, index) => {
                const canvas = document.createElement('canvas')
                canvas.width = 48
                canvas.height = 64
                const context = canvas.getContext('2d')
                if (context === null)
                    throw new Error('Missing PNG raster context')
                context.imageSmoothingEnabled = false
                context.drawImage(
                    source,
                    (index % 4) * 384,
                    Math.floor(index / 4) * 512,
                    384,
                    512,
                    0,
                    0,
                    48,
                    64
                )
                return {
                    name,
                    png: canvas.toDataURL('image/png').split(',')[1],
                }
            })
        },
        { encoded, names }
    )
    await fs.mkdir(directory, { recursive: true })
    for (const frame of frames) {
        await fs.writeFile(
            path.join(directory, `${frame.name}.png`),
            Buffer.from(frame.png, 'base64')
        )
    }
    console.info(`Prepared ${frames.length} transparent 48x64 bell frames`)
} finally {
    await browser.close()
}
