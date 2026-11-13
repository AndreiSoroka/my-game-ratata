import type {
    CharacterArchetype,
    GameEventPayload,
    Vector2,
} from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { Mob1Controller } from '../src/game/controllers'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import type { GameRoom } from '../src/game/room'

interface TimedEvent {
    event: GameEventPayload
    now: number
}

const archetypes: CharacterArchetype[] = ['human', 'skeleton', 'slime']
const approaches = [
    { name: 'right at 22px', offset: { x: 22, y: 0 } },
    { name: 'left at 22px', offset: { x: -22, y: 0 } },
    { name: 'down at 22px', offset: { x: 0, y: 22 } },
    { name: 'up at 22px', offset: { x: 0, y: -22 } },
    { name: 'diagonally down-right', offset: { x: 16.5, y: 16.5 } },
    { name: 'diagonally up-left', offset: { x: -16.5, y: -16.5 } },
]

describe.each(archetypes)('%s controller attack reach', (archetype) => {
    it.each(approaches)(
        'approaches from $name and damages after windup',
        ({ offset }) => {
            const actor = createCharacter(
                'actor',
                archetype,
                { x: 80, y: 80 },
                'peaceful'
            )
            const target = createCharacter(
                'target',
                'skeleton',
                {
                    x: actor.position.x + offset.x,
                    y: actor.position.y + offset.y,
                },
                'monsters'
            )
            const initialPosition = { ...actor.position }
            const events = simulateApproach(actor, target)
            const attack = events.find(({ event }) => event.kind === 'attack')
            const damage = events.find(({ event }) => event.kind === 'damage')

            expect(damage?.event).toMatchObject({
                actorId: actor.id,
                kind: 'damage',
                targetId: target.id,
            })
            expect(actor.position).not.toEqual(initialPosition)
            expect(target.hp).toBeLessThan(target.maxHp)
            expect(attack).toBeDefined()
            expect(damage).toBeDefined()

            if (attack !== undefined && damage !== undefined) {
                expect(damage.now - attack.now).toBeGreaterThanOrEqual(
                    actor.config.combat.attackWindupMs
                )
            }
        }
    )
})

function simulateApproach(
    actor: GameCharacter,
    target: GameCharacter
): TimedEvent[] {
    const navigation = new NavigationService({
        height: 20,
        id: 'open-arena',
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
        tileHeight: 16,
        tileWidth: 16,
        width: 20,
    })
    const events: TimedEvent[] = []
    const controller = new Mob1Controller(1, { fleeWhenThreatened: false })
    const context = (now: number) => ({
        actor,
        now,
        random: () => 0.5,
        respawnDelayMsFor: () => 1_000,
        targets: [actor, target],
        tileSize: navigation.grid.tileWidth,
    })
    const record = (nextEvents: GameEventPayload[], now: number) => {
        events.push(...nextEvents.map((event) => ({ event, now })))
    }
    const room = {
        findVisibleTarget: () => target,
        navigationFor: () => navigation,
        requestAttack: (_character: GameCharacter, now: number) => {
            record(attemptAttack(context(now)), now)
        },
    } as unknown as GameRoom

    for (let now = 5_000; now <= 6_500; now += 50) {
        controller.update(actor, room, now)
        advanceCharacter({ character: actor, deltaMs: 50, navigation, now })
        record(resolvePendingAttackHit(context(now)), now)

        if (events.some(({ event }) => event.kind === 'damage')) {
            break
        }
    }

    return events
}

function createCharacter(
    id: string,
    archetype: CharacterArchetype,
    spawnPosition: Vector2,
    faction: GameCharacter['faction']
): GameCharacter {
    return new GameCharacter({
        archetype,
        controllerKind: 'mob1',
        faction,
        id,
        nickname: id,
        spawnPosition,
    })
}
