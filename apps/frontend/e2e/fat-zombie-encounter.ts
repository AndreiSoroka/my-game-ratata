import type { CharacterSnapshot, ServerMessage, Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

type DamageReceipt = Extract<ServerMessage, { type: 'event' }>

export function recordZombieDamage(page: Page, zombieId: string): DamageReceipt[] {
    const contacts: DamageReceipt[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(String(payload)) as ServerMessage
            if (
                message.type === 'event' &&
                message.event.kind === 'damage' &&
                message.event.actorId === zombieId
            )
                contacts.push(message)
        })
    })
    return contacts
}

export async function expectZombieShove(
    page: Page,
    zombieId: string,
    spawn: Vector2,
    contacts: DamageReceipt[]
): Promise<void> {
    await approach(page, zombieId, spawn)
    const shove = await observeShove(page, zombieId)
    expect(shove.monster).toMatchObject({
        archetype: 'fat_zombie',
        visualId: 'fat_zombie',
        creatureType: 'undead',
    })
    expect(shove.hitAt - shove.startedAt).toBeGreaterThanOrEqual(400)
    expect(shove.hitAt - shove.startedAt).toBeLessThanOrEqual(450)
    expect(shove.serverTime).toBeGreaterThanOrEqual(shove.hitAt)
    expect(shove.positionDiscontinuity).toBe(shove.previousDiscontinuity + 1)
    expect(shove.distance).toBeGreaterThanOrEqual(12)
    expect(shove.away).toBeGreaterThan(0)
    await expect
        .poll(() =>
            contacts
                .filter(
                    ({ serverTime }) =>
                        serverTime >= shove.hitAt && serverTime <= shove.serverTime + 100
                )
                .map(({ event }) => event)
        )
        .toContainEqual(
            expect.objectContaining({
                targetId: shove.playerId,
                attackOrigin: 'basic',
                delivery: 'melee_physical',
            })
        )
}

function observeShove(page: Page, zombieId: string) {
    return page.evaluate(async (id) => {
        const game = window.__ratataTest!
        const deadline = performance.now() + 30_000
        function preparation(zombie: CharacterSnapshot, player: CharacterSnapshot, now: number) {
            const { action, startedAt, hitAt } = zombie.animation
            if (
                action !== 'attack' ||
                hitAt === undefined ||
                now >= hitAt ||
                player.path.length !== 0 ||
                player.velocity.x !== 0 ||
                player.velocity.y !== 0
            )
                return undefined
            return {
                hitAt,
                startedAt,
                position: player.position,
                zombiePosition: zombie.position,
                previousDiscontinuity: player.movement?.positionDiscontinuity ?? 0,
            }
        }
        let windup: ReturnType<typeof preparation>

        while (performance.now() < deadline) {
            const { player, snapshot } = game.getState()
            if (!snapshot || !player?.alive) throw new Error('The explorer fell before the shove')
            const zombie = snapshot.characters.find((actor) => actor.id === id)
            if (zombie) {
                const positionDiscontinuity = player.movement?.positionDiscontinuity ?? 0
                if (windup && positionDiscontinuity > windup.previousDiscontinuity) {
                    const shiftX = player.position.x - windup.position.x
                    const shiftY = player.position.y - windup.position.y
                    return {
                        ...windup,
                        playerId: player.id,
                        monster: {
                            archetype: zombie.archetype,
                            visualId: zombie.visualId,
                            creatureType: zombie.creatureType,
                        },
                        positionDiscontinuity,
                        serverTime: snapshot.serverTime,
                        distance: Math.hypot(shiftX, shiftY),
                        away:
                            shiftX * (windup.position.x - windup.zombiePosition.x) +
                            shiftY * (windup.position.y - windup.zombiePosition.y),
                    }
                }
                windup = preparation(zombie, player, snapshot.serverTime) ?? windup
            }
            await game.waitFor({ type: 'tick', after: snapshot.tick }, { timeoutMs: 1000 })
        }
        throw new Error(`The explorer saw no Fat Zombie shove: ${JSON.stringify(windup)}`)
    }, zombieId)
}

async function approach(page: Page, zombieId: string, spawn: Vector2): Promise<void> {
    await page.evaluate((target) => window.__ratataTest!.send({ type: 'move_to', target }), spawn)
    await page.waitForFunction(
        (id) => {
            const game = window.__ratataTest!
            const { player, snapshot } = game.getState()
            if (!snapshot || !player?.alive) throw new Error('The explorer fell on the approach')
            const zombie = snapshot.characters.find((actor) => actor.id === id)
            return (
                zombie &&
                Math.hypot(
                    player.position.x - zombie.position.x,
                    player.position.y - zombie.position.y
                ) < 26 &&
                game.observe().targets.some((target) => target.id === id)
            )
        },
        zombieId,
        { timeout: 30_000 }
    )
    await page.evaluate(() => window.__ratataTest!.stop())
}
