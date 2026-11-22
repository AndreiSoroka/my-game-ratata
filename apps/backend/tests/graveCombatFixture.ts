import type {
    CharacterControllerKind,
    GameEventPayload,
    HeroClass,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { GameCharacter } from '../src/game/character'
import {
    type AttackContext,
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { grantRetaliation } from '../src/game/crimeRelations'
import { GraveSpawns } from '../src/game/graveSpawns'
import {
    abilityContext,
    abilityHero,
    resolveTestSpells,
} from './abilityTestHelpers'

export function graveCombatFixture(
    heroClass: HeroClass = 'ranger',
    controllerKind: CharacterControllerKind = 'network_player'
) {
    const actor = abilityHero(heroClass, 'humanoid', controllerKind)
    actor.facing = 'right'
    const characters = [actor]
    const service = new GraveSpawns()
    const reference: WorldCombatTarget = { kind: 'grave', id: 'grave' }
    service.register(
        {
            id: reference.id,
            locationId: actor.locationId,
            position: { x: 112, y: 100 },
        },
        [],
        0
    )
    const graves = {
        get: (id: string) => service.get(id),
        list: (id: string) => service.snapshot(id),
        damage: (id: string, amount: number, now: number) =>
            service.damage(id, amount, now),
        purify: (id: string, now: number) => service.purify(id, now),
        contributePurification: (id: string, receiptId: string, at: number) =>
            service.contributePurification(id, receiptId, at),
    }
    const context: import('../src/game/abilityContext').AbilityContext = {
        ...abilityContext(characters, 1000, () => 0.5),
        graves,
    }
    const attack = (
        now = 1000,
        target: WorldCombatTarget | undefined = reference
    ): AttackContext => ({
        actor,
        targets: characters,
        now,
        target,
        graves,
        navigation: context.navigation,
        tileSize: 16,
        random: () => 0.5,
        respawnDelayMsFor: () => 15000,
    })
    context.requestAbilityAttack = (attacker, targetId, id, now, target) =>
        attemptAbilityAttack(
            { ...attack(now, target), actor: attacker, target, targetId },
            id
        )
    const hit = (now = 1050) => [
        ...resolvePendingAttackHit(attack(now)),
        ...resolveTestSpells(actor, context, now),
    ]
    const ability = (
        id: 'shot' | 'spark' | 'fireball' | 'greater_fireball',
        now = 1000,
        target: WorldCombatTarget | null = reference
    ) =>
        handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: id,
                ...(target === null ? {} : { target }),
            },
            { ...context, now }
        )
    const events: GameEventPayload[] = []
    const world = {
        getCharacter: (id: string) =>
            characters.find((entry) => entry.id === id),
        navigationFor: () => context.navigation,
        abilityContextFor: (_actor: GameCharacter, now: number) => ({
            ...context,
            now,
        }),
        publishEvents: (next: GameEventPayload[]) => events.push(...next),
        requestAttack: (
            attacker: GameCharacter,
            now = 1000,
            targetId?: string,
            target?: WorldCombatTarget
        ) => {
            events.push(
                ...attemptAttack({
                    ...attack(now, target),
                    actor: attacker,
                    target,
                    targetId,
                })
            )
        },
    }
    const enemy = (x: number) => {
        const target = abilityHero('vanguard')
        target.position = { x, y: 100 }
        characters.push(target)
        grantRetaliation(actor, target, 60000)
        return target
    }
    return {
        actor,
        characters,
        service,
        reference,
        graves,
        context,
        attack,
        hit,
        ability,
        events,
        world,
        enemy,
    }
}
