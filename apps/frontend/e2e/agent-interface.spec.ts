import { expect, type Page, test } from '@playwright/test'

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

            const accepted = await page.evaluate(async () => {
                const api = window.__ratataTest!
                const action = api
                    .observe()
                    .dialogueChoices.find(
                        (candidate) =>
                            candidate.command.type === 'dialogue_choice' &&
                            candidate.command.choiceId === 'accept_quest'
                    )
                if (!action) throw new Error('The observed dialogue does not offer a quest')
                return api.act(action.command, { until: { type: 'quest', status: 'active' } })
            })
            expect(accepted).toMatchObject({
                status: 'condition_met',
                observation: { adventure: { quest: { status: 'active' } } },
            })

            const closed = await page.evaluate(() =>
                window.__ratataTest!.act(
                    { type: 'dialogue_choice', choiceId: 'close' },
                    { until: { type: 'dialogue', npcId: null } }
                )
            )
            expect(closed.status).toBe('condition_met')

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
            expect(returned).toMatchObject({ status: 'arrived', locationId: initial.locationId })
            const final = await page.evaluate(() => window.__ratataTest!.observe())
            expect(final.player?.id).toBe(initial.playerId)
            expect(final.adventure?.quest.status).toBe('active')
            expect(final.player?.alive).toBe(true)
        })
    }
})

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
