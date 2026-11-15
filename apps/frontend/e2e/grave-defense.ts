import { ABILITY_DEFINITIONS, SHOT_HALF_WIDTH } from '@my-game-ratata/contracts'
import type { Page } from '@playwright/test'

/** Ordinary ranger controllers stay active while the cleric channels the long ritual. */
export async function defendRitual(
    rangers: Page[],
    position: { x: number; y: number }
): Promise<void> {
    const observed = await Promise.all(
        rangers.map((page) =>
            page.evaluate((position) => {
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
                            ) <= 320
                    )
            }, position)
        )
    )
    const threat = observed
        .flat()
        .sort(
            (a, b) =>
                Math.hypot(a.position.x - position.x, a.position.y - position.y) -
                Math.hypot(b.position.x - position.x, b.position.y - position.y)
        )[0]
    if (threat)
        await Promise.all(rangers.map((page, index) => maintainShot(page, threat.id, index)))
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
        ({ id, lane, range, halfWidth }) => {
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
            const along = dx * direction.x + dy * direction.y
            const across = Math.abs(dx * direction.y - dy * direction.x)
            function activeShot(): boolean {
                const action = player.control?.action
                return (
                    action?.kind === 'ability' &&
                    action.abilityId === 'shot' &&
                    action.targetId === id
                )
            }
            if (along >= 38 && along <= range && across <= halfWidth) {
                if (!activeShot())
                    api.send({
                        type: 'auto_action',
                        action: { kind: 'ability', abilityId: 'shot', targetId: id },
                    })
                return
            }
            // A shared 40px target approach made all four shooters stack inside one
            // skeleton arc. Orbit outside melee reach to distinct firing sides, and
            // retreat before a chasing enemy can turn a ranged lane into that pile-up.
            const angle = Math.atan2(dy, dx),
                desired = Math.atan2(direction.y, direction.x)
            const turn = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle))
            const orbiting = Math.abs(turn) > Math.PI / 4
            const nextAngle = orbiting
                ? angle + Math.sign(turn) * Math.min(Math.abs(turn), Math.PI / 2)
                : desired
            function shotRadius(): number {
                return distance < 38 || orbiting ? 104 : range - 8
            }
            const radius = shotRadius()
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
        { id: targetId, lane, range: ABILITY_DEFINITIONS.shot.range, halfWidth: SHOT_HALF_WIDTH }
    )
}
