import { expect, it } from 'vitest'

import {
    attemptAbilityAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { applyAttackStun } from '../src/game/combatDamage'
import { takeSparkInterruptions } from '../src/game/combatInterruption'
import { NavigationService } from '../src/game/navigation'
import { travelRoomCharacter } from '../src/game/roomTravel'
import { WorldLocations } from '../src/game/worldLocations'
import { abilityContext, abilityHero } from './abilityTestHelpers'

function castSpark(actor = abilityHero('arcanist')) {
    const context = {
        actor,
        now: 1000,
        targets: [],
        tileSize: 16,
        respawnDelayMsFor: () => 15_000,
    }
    const start = attemptAbilityAttack(context, 'spark')[0]
    const pending = actor.pendingAttack
    if (start === undefined || pending === undefined) {
        throw new Error('Expected Spark to start')
    }
    return { actor, context, start, pending }
}

it('publishes one interruption receipt when a stun clears a paid Spark', () => {
    const { actor, context, start, pending } = castSpark()
    const skeleton = abilityHero('vanguard', 'undead')
    expect(
        applyAttackStun(
            skeleton,
            actor,
            { ...pending, canStun: true, abilityId: 'skeleton_strike' },
            pending.hitAt - 50,
            () => 0
        )
    ).toContainEqual(
        expect.objectContaining({ kind: 'status', statusId: 'stun' })
    )
    actor.clearPendingAttackHit()
    expect(resolvePendingAttackHit({ ...context, now: pending.hitAt })).toEqual(
        []
    )
    expect(takeSparkInterruptions([actor])).toEqual([
        expect.objectContaining({
            kind: 'attack',
            abilityId: 'spark',
            phase: 'interrupted',
            actorId: actor.id,
            actionId: start.actionId,
            locationId: actor.locationId,
        }),
    ])
    expect(takeSparkInterruptions([actor])).toEqual([])
})

it('keeps a due Spark in its original location until the pending release resolves', () => {
    const actor = abilityHero('arcanist')
    const { navigation } = abilityContext([actor])
    const world = new WorldLocations(
        new NavigationService({ ...navigation.grid, id: 'spark-travel-test' })
    )
    const origin = actor.locationId
    actor.position.x = world.get(origin).navigation.summary.worldWidth - 8
    const { context, pending } = castSpark(actor)
    const direction = { x: 1, y: 0 }
    const characters = new Map([[actor.id, actor]])

    expect(
        travelRoomCharacter(actor, direction, world, characters, pending.hitAt)
    ).toBeUndefined()
    expect(actor.locationId).toBe(origin)
    expect(actor.pendingAttack).toBe(pending)
    expect(
        resolvePendingAttackHit({ ...context, now: pending.hitAt })
    ).toContainEqual(
        expect.objectContaining({
            kind: 'attack',
            abilityId: 'spark',
            phase: 'completed',
        })
    )
    expect(
        travelRoomCharacter(
            actor,
            direction,
            world,
            characters,
            pending.hitAt + 50
        )
    ).toBeDefined()
    expect(actor.locationId).not.toBe(origin)
    expect(takeSparkInterruptions([actor])).toEqual([])
})
