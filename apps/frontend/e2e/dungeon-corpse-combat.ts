import type { CharacterSnapshot, ServerMessage, Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

type DeathReceipt = Extract<ServerMessage, { type: 'event' }>

interface DungeonFight {
    id: string
    spawn: Vector2
    width: number
    collision: number[]
}

export function recordDungeonDeaths(page: Page): DeathReceipt[] {
    const deaths: DeathReceipt[] = []
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(String(payload)) as ServerMessage
            if (message.type === 'event' && message.event.kind === 'death') deaths.push(message)
        })
    })
    return deaths
}

/** Focus-fire on one target and let heavily wounded rangers recover behind the others. */
export async function defeatDungeonMonster(
    party: readonly Page[],
    fight: DungeonFight
): Promise<Page> {
    let nearest = -1
    await expect
        .poll(
            async () => {
                const fighters = await Promise.all(
                    party.map((page) => page.evaluate(dungeonCombatFrame, fight))
                )
                if (fighters.every(({ health }) => health <= 0)) {
                    throw new Error(
                        `The rangers fell before ${fight.id}: ${JSON.stringify(fighters)}`
                    )
                }
                nearest =
                    fighters
                        .map((state, index) => ({ ...state, index }))
                        .filter(({ health, defeated }) => health > 0 && defeated)
                        .sort((a, b) => b.health - a.health || a.range - b.range)[0]?.index ?? -1
                return fighters
            },
            {
                intervals: [200],
                timeout: 150_000,
                message: `Defeat ${fight.id} through ordinary partied combat`,
            }
        )
        .toContainEqual(expect.objectContaining({ defeated: true, health: expect.any(Number) }))
    await Promise.all(
        party.map((page) =>
            page.evaluate(() => window.__ratataTest?.send({ type: 'auto_action', action: null }))
        )
    )
    return party[nearest]!
}

export async function coverDungeonLoot(party: readonly Page[], fight: DungeonFight): Promise<void> {
    await Promise.all(party.map((page) => page.evaluate(dungeonCombatFrame, fight)))
}

function dungeonCombatFrame({ id, spawn, collision, width }: DungeonFight) {
    const game = window.__ratataTest!
    const { player, snapshot } = game.getState()
    if (!player || !snapshot) return { health: 0, defeated: false, range: Infinity }
    const target = snapshot.characters.find((actor) => actor.id === id)
    const distance = (a: Vector2, b: Vector2) => Math.hypot(a.x - b.x, a.y - b.y)
    const health =
        player.health.kind === 'exact'
            ? (100 * player.health.current) / player.health.max
            : player.health.percent
    const range = target ? distance(player.position, target.position) : Infinity
    const defeated = health > 0 && target?.alive === false
    if (player.alive && !defeated) advanceCombat(player)
    return {
        health,
        defeated,
        range,
        position: player.position,
        location: snapshot.location?.id,
        targetHealth: target?.health,
    }

    function advanceCombat(player: CharacterSnapshot): void {
        if (health < 33 && range < 64 && target) {
            retreat(player, target)
        } else if (target && range <= 155 && clearShot(player.position, target.position)) {
            shoot(player, target)
        } else if (player.path.length === 0) {
            game.send({ type: 'move_to', target: target?.position ?? spawn })
        }
    }

    function clearShot(from: Vector2, to: Vector2): boolean {
        const steps = Math.ceil(distance(from, to) / 4)
        for (let step = 1; step <= steps; step++) {
            const x = Math.floor((from.x + ((to.x - from.x) * step) / steps) / 16)
            const y = Math.floor((from.y + ((to.y - from.y) * step) / steps) / 16)
            if (collision[y * width + x] !== 0) return false
        }
        return true
    }

    function retreat(player: CharacterSnapshot, threat: CharacterSnapshot) {
        // The retreat ends before the stair landing at x144/y776.
        const points = [
            { x: 168, y: 712 },
            { x: 168, y: 568 },
            { x: 376, y: 648 },
        ]
        const destination = points
            .filter((point) => distance(player.position, point) >= 48)
            .sort((a, b) => {
                const score = (point: Vector2) =>
                    distance(threat.position, point) - 1.1 * distance(player.position, point)
                return score(b) - score(a)
            })[0]
        const goal = player.path.at(-1)
        if (destination && (!goal || distance(goal, destination) > 8))
            game.send({ type: 'move_to', target: destination })
    }

    function shoot(player: CharacterSnapshot, target: CharacterSnapshot) {
        const abilityId = range <= 52 ? 'shot' : 'sniper_shot'
        const action = player.control?.action
        if (
            action?.kind === 'ability' &&
            action.targetId === target.id &&
            action.abilityId === abilityId
        )
            return
        game.send({
            type: 'auto_action',
            action: { kind: 'ability', targetId: target.id, abilityId },
        })
    }
}
