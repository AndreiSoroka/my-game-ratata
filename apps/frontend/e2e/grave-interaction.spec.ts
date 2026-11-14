import { writeFile } from 'node:fs/promises'

import { expect, type Page, test, type TestInfo } from '@playwright/test'

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
        test.setTimeout(150_000)
        await page.setViewportSize(viewport)
        const rangers = await Promise.all([context.newPage(), context.newPage(), context.newPage()])
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
            await shootGrave(page, ranger, grave!)
            await withdrawRangers(rangers, grave!.position)
            const approached = await page.evaluate(
                (targetKey) =>
                    window.__ratataTest!.navigate(
                        { targetKey },
                        { timeoutMs: 15_000, tolerance: 16 }
                    ),
                grave!.key
            )
            expect(approached.status).toBe('arrived')
            await page.evaluate(
                (position) =>
                    window.__ratataTest!.navigate(
                        { x: position.x + 32, y: position.y + 16 },
                        { tolerance: 2 }
                    ),
                grave!.position
            )
            await faceGrave(page, grave!.id)
            await page.screenshot({ path: info.outputPath('grave-active.png') })
            await openGraveMenu(page, mobile)
            await expect(page.getByRole('menu')).toBeVisible()
            await expect(page.getByLabel('Состояние могилы').last()).toContainText('5% урона')
            await page.screenshot({ path: info.outputPath('grave-menu.png') })
            await page.getByRole('menuitem', { name: 'Упокоить могилу · 20 MP · 10 с' }).click()
            await expect(page.locator('.control-status')).toContainText('Очищение могилы')
            await page.screenshot({ path: info.outputPath('grave-channel.png') })
            const casting = await page.evaluate(() => window.__ratataTest!.getState().player!)
            expect(casting.resources.mana).toBeGreaterThanOrEqual(20)
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
            await faceGrave(page, grave!.id)
            await openGraveMenu(page, mobile)
            await page.getByRole('menuitem', { name: 'Упокоить могилу · 20 MP · 10 с' }).click()
            await expect
                .poll(
                    () =>
                        page.evaluate(
                            (id) =>
                                window
                                    .__ratataTest!.getState()
                                    .snapshot?.graves?.find((grave) => grave.id === id)?.phase,
                            grave!.id
                        ),
                    { timeout: 15_000 }
                )
                .toBe('purified')
            expect(
                await page.evaluate(
                    (key) =>
                        window.__ratataTest!.observe().targets.some((target) => target.key === key),
                    grave!.key
                )
            ).toBe(false)
            const finished = await page.evaluate(() => window.__ratataTest!.getState().player!)
            expect(finished.resources.mana).toBeGreaterThanOrEqual(finished.resources.maxMana - 20)
            expect(finished.resources.mana).toBeLessThan(finished.resources.maxMana - 12)
            await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
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
            await attachCombatFailure([page, ...rangers], info)
            throw error
        } finally {
            await Promise.all(rangers.map((ranger) => ranger.close()))
        }
    })
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
    manaDuringChannel: number,
    manaAfterCompletion: number
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
    if (mobile) {
        const prompt = page.getByRole('button', { name: /E Могила/ })
        const bounds = await prompt.boundingBox()
        const preview = await page.locator('.prayer-preview').boundingBox()
        expect(bounds).not.toBeNull()
        expect(preview).not.toBeNull()
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(preview!.y)
        await prompt.click()
        await assertMobileTargetSpace(page)
    } else {
        await page.locator('canvas[data-game-canvas=true]').focus()
        await page.keyboard.press('KeyE')
    }
}
async function assertMobileTargetSpace(page: Page): Promise<void> {
    const target = page.getByLabel('Выбранная цель')
    await expect(target).toBeVisible()
    const targetBounds = await target.boundingBox()
    const playerBounds = await page.getByRole('region', { name: 'Player status' }).boundingBox()
    expect(targetBounds).not.toBeNull()
    expect(playerBounds).not.toBeNull()
    expect(targetBounds!.y).toBeGreaterThanOrEqual(playerBounds!.y + playerBounds!.height)
}

async function cancelRitual(page: Page, mobile: boolean): Promise<void> {
    if (mobile) await page.getByRole('button', { name: 'Прервать · Esc' }).click()
    else await page.keyboard.press('Escape')
}
async function shootGrave(
    page: Page,
    ranger: Page,
    grave: { id: string; key: string }
): Promise<void> {
    await ranger.evaluate(async (key) => {
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
    }, grave.key)
    await expect
        .poll(() =>
            page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.graves?.find((grave) => grave.id === id)?.hp,
                grave.id
            )
        )
        .toBeLessThan(100)
    const hp = await page.evaluate(
        (id) =>
            window.__ratataTest!.getState().snapshot!.graves!.find((grave) => grave.id === id)!.hp,
        grave.id
    )
    expect(hp).toBeGreaterThan(99)
    expect(hp % 1).not.toBe(0)
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

async function withdrawRangers(rangers: Page[], position: { x: number; y: number }): Promise<void> {
    await Promise.all(
        rangers.map((page, index) =>
            page.evaluate(
                async ({ position, index }) => {
                    const api = window.__ratataTest!
                    if (!api.getState().player?.alive) return
                    await api.navigate(
                        { x: position.x + 128, y: position.y + 80 + index * 16 },
                        { timeoutMs: 10_000 }
                    )
                },
                { position, index }
            )
        )
    )
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
    const arrivals = await Promise.all(
        rangers.map((page) =>
            page.evaluate(
                (position) =>
                    window.__ratataTest!.navigate(
                        { x: position.x, y: position.y + 104 },
                        { timeoutMs: 20_000 }
                    ),
                grave.position
            )
        )
    )
    for (const result of arrivals) expect(result.status, result.reason).toBe('arrived')
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
                    await Promise.all(rangers.map((page) => maintainShot(page, threat.id)))
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

async function maintainShot(page: Page, targetId: string): Promise<void> {
    await page.evaluate(async (id) => {
        const api = window.__ratataTest!
        const current = () => {
            const state = api.getState()
            const player = state.player!
            const target = state.snapshot?.characters.find((actor) => actor.id === id)
            const action = player.control?.action
            return {
                state,
                player,
                target,
                active:
                    action?.kind === 'ability' &&
                    action.abilityId === 'shot' &&
                    action.targetId === id,
            }
        }
        let view = current()
        if (
            !view.player.alive ||
            !view.target?.alive ||
            view.player.cooldowns.stunMsLeft > 0 ||
            view.active
        )
            return
        const command = {
            type: 'auto_action' as const,
            action: { kind: 'ability' as const, abilityId: 'shot' as const, targetId: id },
        }
        await api.act(command, {
            until: { type: 'tick', after: view.state.snapshot!.tick },
            timeoutMs: 1500,
        })
        view = current()
        if (
            view.active ||
            !view.player.alive ||
            !view.target?.alive ||
            view.player.cooldowns.stunMsLeft > 0
        )
            return
        // A map-wide snapshot is not a combat lease: ordinary navigation must earn
        // the server's 240px / line-of-sight acquisition before enabling repeat.
        const route = await api.navigate(
            { targetKey: `character:${id}` },
            { tolerance: 40, timeoutMs: 8000 }
        )
        view = current()
        if (!view.player.alive || !view.target?.alive) return
        if (route.status !== 'arrived')
            throw new Error(`Combat approach ${route.status}: ${route.reason}`)
        await api.act(command, {
            until: { type: 'tick', after: view.state.snapshot!.tick },
            timeoutMs: 1500,
        })
        view = current()
        if (
            !view.active &&
            view.player.alive &&
            view.target?.alive &&
            view.player.cooldowns.stunMsLeft === 0
        )
            throw new Error(
                `Shot lease rejected after approach: ${JSON.stringify({ player: view.player, target: view.target })}`
            )
    }, targetId)
}

async function attachCombatFailure(pages: Page[], info: TestInfo): Promise<void> {
    const party = await Promise.all(
        pages.map((page) =>
            page.evaluate(() => {
                const state = window.__ratataTest!.getState()
                const player = state.player
                return {
                    connected: state.connected,
                    notice: state.notice,
                    tick: state.snapshot?.tick,
                    locationId: state.location?.id,
                    player: player && {
                        id: player.id,
                        alive: player.alive,
                        hp: player.hp,
                        position: player.position,
                        control: player.control,
                        cooldowns: player.cooldowns,
                    },
                    threats: state.snapshot?.characters
                        .filter((actor) => actor.relationship === 'hostile')
                        .map((actor) => ({
                            id: actor.id,
                            alive: actor.alive,
                            hp: actor.hp,
                            position: actor.position,
                        })),
                    graves: state.snapshot?.graves,
                }
            })
        )
    )
    const path = info.outputPath('grave-combat-failure.json')
    await writeFile(path, JSON.stringify(party, null, 2), 'utf8')
    await info.attach('grave-combat-failure', { contentType: 'application/json', path })
}

async function faceGrave(page: Page, id: string): Promise<void> {
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
    }, id)
}
