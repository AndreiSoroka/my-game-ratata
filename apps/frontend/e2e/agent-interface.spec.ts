import { expect, type Page, test } from '@playwright/test'

import { abandonGuildContract, openObservedWorkerOffer } from './worker-contract-helpers'

test.describe('AI player interface', () => {
    test.setTimeout(120_000)

    for (const mobile of [false, true]) {
        test(`navigates, accepts a quest and crosses locations (${mobile ? 'mobile' : 'desktop'})`, async ({
            page,
        }, info) => {
            await page.setViewportSize(
                mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
            )
            await page.goto('/?test=1')
            await page.waitForFunction(() => Boolean(window.__ratataTest))
            await page.evaluate(
                (name) => window.__ratataTest!.join(name, 'ranger'),
                `ai-${info.workerIndex}-${mobile ? 'm' : 'd'}-${Date.now().toString(36)}`
            )
            await expectTarget(page, 'building', 'Гильдия искателей')

            const initial = await page.evaluate(() => {
                const observation = window.__ratataTest!.observe()
                const guild = observation.targets.find(
                    (target) => target.kind === 'building' && target.name === 'Гильдия искателей'
                )
                if (!guild) throw new Error('No guild entrance is observed')
                const exit = observation.exits.find((candidate) => candidate.direction === 'south')
                if (!exit) throw new Error('No observed south exit')
                return {
                    playerId: observation.player!.id,
                    locationId: observation.location!.id,
                    nextLocationId: exit.locationId,
                    entranceKey: guild.key,
                }
            })

            const entered = await page.evaluate(
                (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 30_000 }),
                initial.entranceKey
            )
            expect(entered.status).toBe('arrived')
            await expectTarget(page, 'character', 'Mira')
            const miraKey = await page.evaluate(
                () =>
                    window
                        .__ratataTest!.observe()
                        .targets.find(
                            (target) => target.kind === 'character' && target.name === 'Mira'
                        )!.key
            )

            const approached = await page.evaluate(
                (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 30_000 }),
                miraKey
            )
            expect(approached).toMatchObject({ status: 'arrived', locationId: initial.locationId })

            const conversation = await page.evaluate(async (key) => {
                const api = window.__ratataTest!
                const target = api.observe().targets.find((candidate) => candidate.key === key)
                const action = target?.actions.find(
                    (candidate) => candidate.command.type === 'interact'
                )
                if (!target || !action) throw new Error('Mira has no available interaction')
                return api.act(action.command, { until: { type: 'dialogue', npcId: target.id } })
            }, miraKey)
            expect(conversation.status).toBe('condition_met')

            // The standard generated city has an active Bell. Its live worker
            // contracts remain available through the same observed dialogue.
            const instanceId = await acceptObservedWorkerContract(page)
            try {
                const departed = await page.evaluate(() =>
                    window.__ratataTest!.travel('south', { timeoutMs: 30_000 })
                )
                expect(departed).toMatchObject({
                    status: 'arrived',
                    locationId: initial.nextLocationId,
                })
                const returned = await page.evaluate(() =>
                    window.__ratataTest!.travel('north', { timeoutMs: 30_000 })
                )
                expect(returned).toMatchObject({
                    status: 'arrived',
                    locationId: initial.locationId,
                })
                const final = await page.evaluate(() => window.__ratataTest!.getState())
                expect(final.player?.id).toBe(initial.playerId)
                expect(final.snapshot?.party?.activeJob).toMatchObject({
                    instanceId,
                    status: 'active',
                })
                expect(final.player?.alive).toBe(true)
            } finally {
                // Release the real incident so the next viewport can inspect it.
                await abandonGuildContract(page, instanceId)
            }
        })
    }
})

async function acceptObservedWorkerContract(page: Page): Promise<string> {
    await openObservedWorkerOffer(page)
    await page.evaluate(() => {
        const api = window.__ratataTest!
        const offer = api.getState().snapshot!.social!.questOffer!
        api.send({
            type: 'quest_offer_answer',
            offerId: offer.id,
            revision: offer.revision,
            accept: true,
        })
    })
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().snapshot?.party?.activeJob?.status)
        )
        .toBe('active')
    return page.evaluate(
        () => window.__ratataTest!.getState().snapshot!.party!.activeJob!.instanceId
    )
}

async function expectTarget(page: Page, kind: string, name: string): Promise<void> {
    await expect
        .poll(() =>
            page.evaluate(
                ({ kind, name }) =>
                    window
                        .__ratataTest!.observe()
                        .targets.some((target) => target.kind === kind && target.name === name),
                { kind, name }
            )
        )
        .toBe(true)
}
