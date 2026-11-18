import { expect, type Page } from '@playwright/test'

/** Wait for a worker's real report, then request its offer through observed dialogue. */
export async function openObservedWorkerOffer(page: Page): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(() =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.party?.jobs.some((job) => job.workRequest !== undefined)
                ),
            { timeout: 60_000 }
        )
        .toBe(true)
    await page.evaluate(async () => {
        const api = window.__ratataTest!
        const npcId = api.observe().adventure!.dialogue!.npcId
        await api.act({ type: 'interact', targetId: npcId })
    })
    const proposal = await page.evaluate(async () => {
        const api = window.__ratataTest!
        const action = api
            .observe()
            .dialogueChoices.find(
                (candidate) =>
                    candidate.command.type === 'dialogue_choice' &&
                    candidate.command.choiceId.startsWith('worker-contract:')
            )
        if (!action) throw new Error('The observed dialogue has no available worker request')
        return api.act(action.command, { until: { type: 'dialogue', npcId: null } })
    })
    expect(proposal.status, proposal.reason).toBe('condition_met')
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().snapshot?.social?.questOffer?.id)
        )
        .toBeTruthy()
}

export async function abandonGuildContract(page: Page, instanceId: string): Promise<void> {
    await page.evaluate(
        (instanceId) => window.__ratataTest!.send({ type: 'guild_abandon', instanceId }),
        instanceId
    )
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob?.status)
        )
        .not.toBe('active')
}
