import { expect, it } from 'vitest'

import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { abilityHero } from './abilityTestHelpers'

function damageFrom(
    attack: 'shot' | 'spark' | 'melee',
    stars: readonly string[],
    aimed = true
): number {
    const actor = abilityHero(attack === 'shot' ? 'ranger' : 'arcanist')
    const skeleton = abilityHero('vanguard', 'undead', 'mob1')
    Object.assign(skeleton, { faction: 'monsters' })
    actor.facing = 'down'
    skeleton.position = { x: 100, y: 112 }
    for (const star of stars) {
        skeleton.progression.constellations.opened.add(star)
    }
    const context = {
        actor,
        ...(aimed ? { targetId: skeleton.id } : {}),
        targets: [skeleton],
        now: 1000,
        tileSize: 16,
        respawnDelayMsFor: () => 15_000,
        random: () => 0.9,
    }
    const events =
        attack === 'melee'
            ? attemptAttack(context)
            : attemptAbilityAttack(context, attack)
    expect(events).toHaveLength(1)
    const hpBefore = skeleton.hp
    expect(resolvePendingAttackHit({ ...context, now: 1250 })).toContainEqual(
        expect.objectContaining({ kind: 'damage', targetId: skeleton.id })
    )
    return hpBefore - skeleton.hp
}

const hollowBones = ['undead.hollow_bones']
const strengthenedBones = [...hollowBones, 'undead.hollow_bones2']

it.each([true, false])(
    'applies each bone armor rank to shared arrow damage (aimed: %s)',
    (aimed) => {
        expect(damageFrom('shot', [], aimed)).toBe(7)
        expect(damageFrom('shot', hollowBones, aimed)).toBe(6)
        expect(damageFrom('shot', strengthenedBones, aimed)).toBe(5)
    }
)

it.each(['melee', 'spark'] as const)('leaves %s damage alone', (attack) => {
    expect(damageFrom(attack, strengthenedBones)).toBe(damageFrom(attack, []))
})
