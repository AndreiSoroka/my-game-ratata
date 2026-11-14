import { expect, type Page } from '@playwright/test'

/** Face the observed source with ordinary movement, never a test-state write. */
export async function faceGrave(page: Page, id: string): Promise<void> {
    await page.evaluate(async (id) => {
        const api = window.__ratataTest!,
            player = api.getState().player!,
            grave = api.getState().snapshot!.graves!.find((grave) => grave.id === id)!
        const delta = {
            x: grave.position.x - player.position.x,
            y: grave.position.y - player.position.y,
        }
        const axis =
            Math.abs(delta.x) > Math.abs(delta.y)
                ? { x: Math.sign(delta.x), y: 0 }
                : { x: 0, y: Math.sign(delta.y) }
        await api.moveFor(axis, 60)
        const after = api.getState().snapshot!.tick
        await api.waitFor({ type: 'tick', after })
    }, id)
}

/** A nearby guardian corpse may legitimately win E's nearest-facing selection.
 * Approach from another side and confirm the actual prompt before pressing E.
 * Opening that source's menu pins it through the subsequent ritual workflow.
 */
export async function approachObservedGrave(page: Page, key: string): Promise<void> {
    const source = await page.evaluate(
        (key) => window.__ratataTest!.observe().targets.find((target) => target.key === key),
        key
    )
    expect(source?.kind).toBe('grave')
    const attempts: unknown[] = []
    for (const offset of [
        { x: 0, y: -32 },
        { x: 32, y: 0 },
        { x: -32, y: 0 },
        { x: 0, y: 32 },
        { x: 24, y: -24 },
        { x: -24, y: -24 },
        { x: 24, y: 24 },
        { x: -24, y: 24 },
    ]) {
        const reached = await page.evaluate(
            ({ position, offset }) =>
                window.__ratataTest!.navigate(
                    { x: position.x + offset.x, y: position.y + offset.y },
                    { tolerance: 1, timeoutMs: 5_000 }
                ),
            { position: source!.position, offset }
        )
        if (reached.status !== 'arrived') {
            attempts.push({ offset, status: reached.status })
            continue
        }
        await faceGrave(page, source!.id)
        const prompt = page.getByRole('button', { name: /^E Могила / })
        if (await prompt.isVisible()) return
        attempts.push({ offset, prompt: await page.locator('.nearby-prompt').allTextContents() })
    }
    throw new Error(`Cannot select observed ${key} through E: ${JSON.stringify(attempts)}`)
}
