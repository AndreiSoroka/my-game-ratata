import { type GameEventPayload, type ResourceSnapshot } from '@my-game-ratata/contracts'
import { expect, type Page, test, type TestInfo } from '@playwright/test'

import { defendRitual, maintainShot, withdrawRangers } from './grave-defense'
import {
    attachBrowserDiagnostics,
    attachCombatFailure,
    captureBrowserDiagnostics,
    capturePrayerManaAtStart,
    capturePurificationTargets,
    captureWorldDamage,
} from './grave-diagnostics'
import { approachObservedGrave } from './grave-targeting'
import { selectedWorldTarget } from './world-target-ui'

const cases = [
    // Final-death scenarios use the north; each ritual gets its own authored source.
    { mobile: false, direction: 'west', viewport: { width: 1280, height: 800 } },
    { mobile: true, direction: 'south', viewport: { width: 390, height: 844 } },
] as const
for (const { mobile, direction, viewport } of cases) {
    test(`attacks and explicitly purifies an observed grave (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
        context,
    }, info) => {
        test.setTimeout(300_000)
        await page.setViewportSize(viewport)
        const rangers = await Promise.all(Array.from({ length: 4 }, () => context.newPage()))
        const diagnostics = captureBrowserDiagnostics([page, ...rangers])
        const worldDamage = captureWorldDamage(page)
        const purificationTargets = capturePurificationTargets(page)
        const manaAtStart = capturePrayerManaAtStart(page)
        try {
            await Promise.all(
                rangers.map((ranger) => ranger.setViewportSize({ width: 480, height: 360 }))
            )
            await Promise.all([
                join(page, 'cleric'),
                ...rangers.map((ranger, index) => join(ranger, 'ranger', String(index))),
            ])
            await travelParty([page, ...rangers], direction)
            const grave = await clearGraveApproach(rangers)
            const ranger = await livingRanger(rangers)
            await approachSource(page, grave)
            await shootGrave(page, ranger, grave!, worldDamage)
            await withdrawRangers(rangers, grave!.position)
            await approachObservedGrave(page, grave!.key)
            await page.screenshot({ path: info.outputPath('grave-active.png') })
            await openGraveMenu(page, mobile)
            await expect(page.getByRole('menu')).toBeVisible()
            await expect(page.getByLabel('Состояние могилы').last()).toContainText('5% урона')
            await page.screenshot({ path: info.outputPath('grave-menu.png') })
            await page.getByRole('menuitem', { name: 'Упокоить могилу · 5 MP · 3 с' }).click()
            await expect.poll(() => purificationTargets).toEqual([grave!.id])
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest!.getState().player?.abilities?.casting?.mode
                    )
                )
                .toBe('purify_grave')
            await expect(page.locator('.control-status')).toHaveCount(0)
            await page.screenshot({ path: info.outputPath('grave-channel.png') })
            const casting = await page.evaluate(() => window.__ratataTest!.getState().player!)
            expect(casting.resourceChecks?.prayers.pray.purify_grave).toBe('ready')
            expect(casting.resources.mana.kind).toBe('percent')
            await cancelRitual(page, mobile)
            await expect
                .poll(() =>
                    page.evaluate(() => window.__ratataTest!.getState().player?.abilities?.casting)
                )
                .toBeNull()
            expect(
                await page.evaluate(
                    (id) =>
                        window
                            .__ratataTest!.getState()
                            .snapshot!.graves!.find((grave) => grave.id === id)!.phase,
                    grave!.id
                )
            ).toBe('active')
            await expect
                .poll(() =>
                    page.evaluate(
                        () => window.__ratataTest!.getState().player?.abilities?.cooldowns.pray ?? 0
                    )
                )
                .toBe(0)
            await approachObservedGrave(page, grave!.key)
            await openGraveMenu(page, mobile)
            await page.getByRole('menuitem', { name: 'Упокоить могилу · 5 MP · 3 с' }).click()
            await expect.poll(() => purificationTargets).toEqual([grave!.id, grave!.id])
            await completePurification(page, rangers, grave!.id, grave!.position)
            expect(
                await page.evaluate(
                    (key) =>
                        window.__ratataTest!.observe().targets.some((target) => target.key === key),
                    grave!.key
                )
            ).toBe(false)
            const finished = await page.evaluate(() => window.__ratataTest!.getState().player!)
            expect(finished.resources.mana.kind).toBe('percent')
            expect(manaAtStart.length).toBeGreaterThanOrEqual(2)
            expect(manaAtStart.every((percent) => percent < 100)).toBe(true)
            await expect(selectedWorldTarget(page)).toHaveCount(0)
            await page.screenshot({ path: info.outputPath('grave-purified.png') })
            await attachOutcome(
                page,
                ranger,
                info,
                grave!.id,
                casting.resources.mana,
                finished.resources.mana
            )
            expect(await page.evaluate(() => window.__ratataTest!.getState().player?.alive)).toBe(
                true
            )
        } catch (error) {
            await attachBrowserDiagnostics(info, error, diagnostics)
            await attachCombatFailure([page, ...rangers], info)
            throw error
        } finally {
            await Promise.all(rangers.map((ranger) => ranger.close()))
        }
    })
}

async function completePurification(
    page: Page,
    rangers: Page[],
    id: string,
    position: { x: number; y: number }
): Promise<void> {
    const identity = await page.evaluate(() => window.__ratataTest!.getState().player!.id)
    await page.evaluate(
        (id) =>
            window.__ratataTest!.send({
                type: 'auto_action',
                action: {
                    kind: 'prayer',
                    abilityId: 'pray',
                    intent: { mode: 'purify_grave', target: { kind: 'grave', id } },
                },
            }),
        id
    )
    const deadline = Date.now() + 210_000
    let phase: string | undefined
    while (Date.now() < deadline) {
        await defendRitual(rangers, position)
        const state = await page.evaluate((id) => {
            const state = window.__ratataTest!.getState()
            return {
                identity: state.player?.id,
                alive: state.player?.alive,
                notice: state.notice,
                tick: state.snapshot!.tick,
                phase: state.snapshot?.graves?.find((grave) => grave.id === id)?.phase,
            }
        }, id)
        expect(state.identity, `Ritual identity lost: ${JSON.stringify(state)}`).toBe(identity)
        expect(state.alive, `Ritual caster defeated: ${JSON.stringify(state)}`).toBe(true)
        phase = state.phase
        if (phase === 'purified') break
        await page.evaluate(
            (after) => window.__ratataTest!.waitFor({ type: 'tick', after }, { timeoutMs: 1000 }),
            state.tick
        )
    }
    expect(phase).toBe('purified')
    expect(
        await page.evaluate(
            (id) =>
                window.__ratataTest!.getState().snapshot?.graves?.find((grave) => grave.id === id)
                    ?.purification,
            id
        )
    ).toEqual({ completed: 5, required: 5 })
}

async function approachSource(
    page: Page,
    grave: { key: string; position: { x: number; y: number } }
): Promise<void> {
    const reached = await page.evaluate(
        (position) =>
            window.__ratataTest!.navigate(
                { x: position.x, y: position.y + 104 },
                { timeoutMs: 20_000 }
            ),
        grave.position
    )
    expect(reached.status, reached.reason).toBe('arrived')
    expect(
        await page.evaluate(
            (key) => window.__ratataTest!.observe().targets.some((target) => target.key === key),
            grave.key
        )
    ).toBe(true)
}

async function travelParty(pages: Page[], direction: 'west' | 'south'): Promise<void> {
    const results = await Promise.all(
        pages.map((participant) =>
            participant.evaluate(
                (direction) => window.__ratataTest!.travel(direction, { timeoutMs: 30_000 }),
                direction
            )
        )
    )
    for (const result of results) expect(result.status, result.reason).toBe('arrived')
}

async function attachOutcome(
    page: Page,
    ranger: Page,
    info: TestInfo,
    id: string,
    manaDuringChannel: ResourceSnapshot,
    manaAfterCompletion: ResourceSnapshot
): Promise<void> {
    await expect
        .poll(() =>
            ranger.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.graves?.find((grave) => grave.id === id)?.phase,
                id
            )
        )
        .toBe('purified')
    await info.attach('grave-outcome', {
        contentType: 'application/json',
        body: JSON.stringify({
            manaDuringChannel,
            manaAfterCompletion,
            grave: await page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.graves?.find((grave) => grave.id === id),
                id
            ),
        }),
    })
}

async function openGraveMenu(page: Page, mobile: boolean): Promise<void> {
    const prompt = page.getByRole('button', { name: /^F Могила / })
    await expect(prompt).toBeVisible()
    if (mobile) {
        const bounds = await prompt.boundingBox()
        const hotbar = await page.locator('.hotbar__tray').boundingBox()
        expect(bounds).not.toBeNull()
        expect(hotbar).not.toBeNull()
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(hotbar!.y)
        await prompt.click()
    } else {
        await page.locator('canvas[data-game-canvas=true]').focus()
        await page.keyboard.press('KeyF')
    }
    await expect(selectedWorldTarget(page)).toHaveAttribute('data-selected-target-key', /^grave:/)
}

async function cancelRitual(page: Page, mobile: boolean): Promise<void> {
    const cancel = page.getByRole('button', { name: 'Прервать молитву' })
    if (mobile) {
        await expect(cancel).toHaveText('×')
        await cancel.click()
    } else {
        await expect(cancel).toBeHidden()
        await page.keyboard.press('Escape')
    }
}
async function shootGrave(
    page: Page,
    ranger: Page,
    grave: { id: string; key: string },
    events: GameEventPayload[]
): Promise<void> {
    const first = events.length
    const before = await page.evaluate(
        (id) =>
            window.__ratataTest!.getState().snapshot!.graves!.find((grave) => grave.id === id)!
                .health,
        grave.id
    )
    expect(before.kind).toBe('percent')
    const actorId = await ranger.evaluate(async (key) => {
        const api = window.__ratataTest!
        const grave = api.observe().targets.find((target) => target.key === key)!
        // Interaction reach is wider than Shot's lane; line up with the source.
        const approach = await api.navigate(
            { x: grave.position.x, y: grave.position.y + 48 },
            { timeoutMs: 15_000, tolerance: 2 }
        )
        if (approach.status !== 'arrived')
            throw new Error(`Shot approach ${approach.status}: ${approach.reason}`)
        api.send({
            type: 'use_ability',
            abilityId: 'shot',
            target: { kind: 'grave', id: grave.id },
        })
        return api.getState().localPlayerId
    }, grave.key)
    const matchingHit = () =>
        events
            .slice(first)
            .find((event) => event.actorId === actorId && event.target?.id === grave.id)
    await expect.poll(matchingHit).toBeTruthy()
    expect(matchingHit()).not.toHaveProperty('amount')
    expect(matchingHit()?.hitQuality).toMatch(/weak|normal|strong|critical/)
    await page.evaluate(async () => {
        const api = window.__ratataTest!
        await api.waitFor({ type: 'tick', after: api.getState().snapshot!.tick })
    })
    await expect
        .poll(() =>
            page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.graves?.find((grave) => grave.id === id)?.health,
                grave.id
            )
        )
        .toMatchObject({ kind: 'percent' })
    await expect
        .poll(async () => {
            const health = await page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot!.graves!.find((grave) => grave.id === id)!.health,
                grave.id
            )
            return health.kind === 'percent' ? health.percent : 100
        })
        .toBeLessThanOrEqual(before.kind === 'percent' ? before.percent : 100)
    const hp = await page.evaluate(
        (id) =>
            window.__ratataTest!.getState().snapshot!.graves!.find((grave) => grave.id === id)!
                .health,
        grave.id
    )
    expect(hp.kind).toBe('percent')
    if (hp.kind === 'percent') {
        expect(Number.isInteger(hp.percent)).toBe(true)
        expect(hp.percent).toBeGreaterThan(0)
        expect(hp.percent).toBeLessThan(100)
    }
    await ranger.evaluate(() => {
        const api = window.__ratataTest!,
            player = api.getState().player!
        api.send({
            type: 'move_to',
            target: { x: player.position.x + 120, y: player.position.y + 80 },
        })
    })
}

async function join(page: Page, heroClass: 'cleric' | 'ranger', suffix = ''): Promise<void> {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(({ name, heroClass }) => window.__ratataTest!.join(name, heroClass), {
        name: `grave-${heroClass}-${Date.now().toString(36)}${suffix}`,
        heroClass,
    })
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })
}

async function livingRanger(rangers: Page[]): Promise<Page> {
    for (const ranger of rangers) {
        if (await ranger.evaluate(() => window.__ratataTest!.getState().player?.alive))
            return ranger
    }
    throw new Error('The ordinary ranger party was defeated')
}
async function clearGraveApproach(
    rangers: Page[]
): Promise<{ id: string; key: string; position: { x: number; y: number } }> {
    const source = await rangers[0]!.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot?.graves?.find(
                (grave) => grave.propId !== undefined && grave.phase === 'active'
            )
    )
    expect(source, 'The received location has an active authored grave').toBeDefined()
    const grave = { id: source!.id, key: `grave:${source!.id}`, position: source!.position }
    // Approach while fighting, rather than walking unarmed into the guardian's
    // patrol first. Each ranger keeps its own cardinal firing lane at Shot reach.
    // Earlier cases can leave distant mobs and create new death graves. Clear only
    // actual threats to this source, rediscovering them after each resolved death.
    for (let count = 0; count < 12; count++) {
        const observer = await livingRanger(rangers)
        const threat = await observer.evaluate(
            (position) =>
                window
                    .__ratataTest!.observe()
                    .targets.filter(
                        (target) =>
                            target.kind === 'character' &&
                            target.details.alive === true &&
                            target.details.relationship === 'hostile' &&
                            Math.hypot(
                                target.position.x - position.x,
                                target.position.y - position.y
                            ) <= 260
                    )
                    .sort((first, second) => first.distance - second.distance)[0],
            grave.position
        )
        if (!threat) return grave
        await expect
            .poll(
                async () => {
                    await Promise.all(
                        rangers.map((page, index) => maintainShot(page, threat.id, index))
                    )
                    const witness = await livingRanger(rangers)
                    return witness.evaluate(
                        (id) =>
                            window
                                .__ratataTest!.getState()
                                .snapshot?.characters.find((actor) => actor.id === id)?.alive,
                        threat.id
                    )
                },
                { timeout: 25_000, intervals: [250] }
            )
            .toBe(false)
    }
    throw new Error('The ranger party did not clear the observed ritual area')
}
