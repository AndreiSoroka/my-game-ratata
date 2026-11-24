import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'
import type { Page } from '@playwright/test'

/** Ordinary ranger controllers stay active while the cleric channels the long ritual. */
export async function defendRitual(
    rangers: Page[],
    position: { x: number; y: number }
): Promise<void> {
    const threat = await nearestRitualThreat(rangers, position, 320)
    if (threat)
        await Promise.all(rangers.map((page, index) => maintainShot(page, threat.id, index)))
}

export async function nearestRitualThreat(
    rangers: Page[],
    position: { x: number; y: number },
    range: number
) {
    const observed = await Promise.all(
        rangers.map((page) =>
            page.evaluate(
                ({ position, range }) => {
                    const api = window.__ratataTest!
                    if (!api.getState().player?.alive) return []
                    return api
                        .observe()
                        .targets.filter(
                            (target) =>
                                target.kind === 'character' &&
                                target.details.alive === true &&
                                target.details.relationship === 'hostile' &&
                                Math.hypot(
                                    target.position.x - position.x,
                                    target.position.y - position.y
                                ) <= range
                        )
                },
                { position, range }
            )
        )
    )
    return observed
        .flat()
        .sort(
            (a, b) =>
                Math.hypot(a.position.x - position.x, a.position.y - position.y) -
                Math.hypot(b.position.x - position.x, b.position.y - position.y)
        )[0]
}

export async function withdrawRangers(
    rangers: Page[],
    position: { x: number; y: number }
): Promise<void> {
    const directions = [
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
    ]
    await Promise.all(
        rangers.map((page, index) =>
            page.evaluate(
                async ({ position, direction }) => {
                    const api = window.__ratataTest!
                    if (!api.getState().player?.alive) return
                    await api.navigate(
                        { x: position.x + direction.x * 128, y: position.y + direction.y * 128 },
                        { timeoutMs: 10000 }
                    )
                },
                { position, direction: directions[index]! }
            )
        )
    )
}

export async function maintainShot(page: Page, targetId: string, lane: number): Promise<void> {
    await page.evaluate(
        ({ id, lane, range }) => {
            const api = window.__ratataTest!,
                state = api.getState(),
                player = state.player!
            const target = state.snapshot?.characters.find((actor) => actor.id === id)
            if (!player.alive || !target?.alive || player.cooldowns.stunMsLeft > 0) return
            const dx = player.position.x - target.position.x,
                dy = player.position.y - target.position.y
            const distance = Math.hypot(dx, dy)
            const directions = [
                { x: -1, y: 0 },
                { x: 0, y: 1 },
                { x: 1, y: 0 },
                { x: 0, y: -1 },
            ]
            const direction = directions[lane % directions.length]!
            function activeShot(): boolean {
                const action = player.control?.action
                return (
                    action?.kind === 'ability' &&
                    action.abilityId === 'sniper_shot' &&
                    action.targetId === id
                )
            }
            if (distance >= 40 && distance <= range) {
                if (!activeShot())
                    api.send({
                        type: 'auto_action',
                        action: { kind: 'ability', abilityId: 'sniper_shot', targetId: id },
                    })
                return
            }
            // Approach from separate sides. If chased into melee, retreat radially
            // so the rangers can resume their ordinary long-range shots.
            const angle = Math.atan2(dy, dx),
                desired = Math.atan2(direction.y, direction.x)
            const turn = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle))
            const nextAngle =
                distance < 40
                    ? angle
                    : angle + Math.sign(turn) * Math.min(Math.abs(turn), Math.PI / 2)
            const radius = range - 28
            const map = state.location!.map
            const position = {
                x: Math.max(
                    16,
                    Math.min(map.worldWidth - 16, target.position.x + Math.cos(nextAngle) * radius)
                ),
                y: Math.max(
                    16,
                    Math.min(map.worldHeight - 16, target.position.y + Math.sin(nextAngle) * radius)
                ),
            }
            api.send({ type: 'move_to', target: position })
        },
        { id: targetId, lane, range: ABILITY_DEFINITIONS.sniper_shot.range }
    )
}
