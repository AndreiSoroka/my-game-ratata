import type { AttackAbilityId, HeroClass } from '@my-game-ratata/contracts'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import {
    type AttackContext,
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { createTrainingTarget } from '../src/game/trainingTargets'
import { abilityContext, abilityHero } from './abilityTestHelpers'

export function trainingCombatFixture(heroClass: HeroClass = 'vanguard') {
    const actor = abilityHero(heroClass)
    const dummy = createTrainingTarget({
        id: 'test:training:dummy',
        areaId: 'test:training:yard',
        locationId: actor.locationId,
        position: { x: 100, y: 112 },
        visualId: 'training_dummy',
    })
    const characters = [actor, dummy]
    const context = abilityContext(characters, 1000, () => 0.5)
    const attack = (now = 1000, attacker = actor): AttackContext => ({
        actor: attacker,
        targets: characters,
        targetId: dummy.id,
        now,
        tileSize: 16,
        navigation: context.navigation,
        respawnDelayMsFor: () => 15000,
        random: () => 0.5,
    })
    context.requestAbilityAttack = (attacker, targetId, id, now) =>
        attemptAbilityAttack({ ...attack(now, attacker), targetId }, id)
    return {
        actor,
        dummy,
        characters,
        context,
        attack,
        start: (now = 1000) => attemptAttack(attack(now)),
        hit: (now = 1050) => resolvePendingAttackHit(attack(now)),
        ability: (
            id: AttackAbilityId | 'fireball' | 'greater_fireball',
            now = 1000
        ) =>
            handleAbilityCommand(
                actor,
                { type: 'use_ability', abilityId: id, targetId: dummy.id },
                { ...context, now }
            ),
    }
}
