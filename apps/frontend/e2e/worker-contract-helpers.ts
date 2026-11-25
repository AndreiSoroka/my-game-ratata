import { expect, type Page } from '@playwright/test'

import { socialMenu } from './social-helpers'

/** Wait for a worker's real report, then ask the clerk for that named order. */
export async function openObservedWorkerOffer(page: Page, clerkId: string): Promise<void> {
    const currentOrder = () =>
        page.evaluate(
            (id) =>
                window
                    .__ratataTest!.getState()
                    .snapshot?.party?.jobs.find(
                        ({ workRequest }) =>
                            workRequest?.clerkId === id && workRequest.stage === 'waiting'
                    )?.title,
            clerkId
        )
    await expect.poll(currentOrder, { timeout: 60_000 }).toBeTruthy()
    const title = await currentOrder()
    await whisperQuestRequest(page, clerkId, `Хочу взять «${title}»`)
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().snapshot?.social?.questOffer?.id)
        )
        .toBeTruthy()
}

export async function whisperQuestRequest(
    page: Page,
    clerkId: string,
    text: string
): Promise<void> {
    const whisper = page.getByRole('dialog', { name: /^Шёпот:/u })
    if (!(await whisper.isVisible())) await socialMenu(page, clerkId, /^Шёпот:/u)
    const input = whisper.getByRole('textbox', { name: 'Сказать шёпотом' })
    await input.fill(text)
    await input.press('Enter')
}

export async function abandonGuildContract(page: Page, instanceId: string): Promise<void> {
    await page.evaluate(
        (instanceId) => window.__ratataTest!.send({ type: 'guild_abandon', instanceId }),
        instanceId
    )
    await expect
        .poll(() =>
            page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.party?.activeJobs.some((job) => job.instanceId === id) ?? false,
                instanceId
            )
        )
        .toBe(false)
}
