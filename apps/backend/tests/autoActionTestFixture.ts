import {
    type CharacterAutoAction,
    type GameEventPayload,
    type HeroClass,
} from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import {
    advanceCharacterControl,
    type ControlWorld,
    setCharacterControl,
} from '../src/game/characterControl'
import { advanceRevive } from '../src/game/characterLife'
import {
    attemptAbilityAttack,
    attemptAttack,
    resolvePendingAttackHit,
} from '../src/game/combat'
import { grantRetaliation } from '../src/game/crimeRelations'
import { abilityContext, abilityHero } from './abilityTestHelpers'

export function autoActionFixture(heroClass: HeroClass = 'cleric') {
    const actor = abilityHero(heroClass)
    const target = abilityHero('vanguard')
    target.position.x = 112
    const characters = [actor, target]
    const context = abilityContext(characters)
    const events: GameEventPayload[] = []
    const publishEvents = vi.fn((next: GameEventPayload[]) => {
        events.push(...next)
    })
    const attackContext = (
        attacker: GameCharacter,
        now: number,
        targetId?: string
    ) => ({
        actor: attacker,
        now,
        targetId,
        targets: characters,
        navigation: context.navigation,
        tileSize: 16,
        random: () => 0.9,
        respawnDelayMsFor: () => 15_000,
    })
    const world: ControlWorld = {
        getCharacter: (id) =>
            characters.find((character) => character.id === id),
        navigationFor: () => context.navigation,
        publishEvents,
        abilityContextFor: (_actor, now) => ({
            ...context,
            now,
            requestAbilityAttack: (attacker, id, ability, time) =>
                attemptAbilityAttack(
                    attackContext(attacker, time, id),
                    ability
                ),
        }),
        requestAttack: (attacker, now = 1000, id) => {
            publishEvents(attemptAttack(attackContext(attacker, now, id)))
        },
    }
    const enable = (action: CharacterAutoAction, now = 1000) =>
        setCharacterControl(actor, { type: 'auto_action', action }, world, now)
    const tick = (now: number) => advanceCharacterControl(actor, world, now)
    const hostile = () => grantRetaliation(actor, target, 60_000)
    return {
        actor,
        target,
        characters,
        context,
        world,
        events,
        publishEvents,
        enable,
        tick,
        hostile,
        completePrayer: (now: number) =>
            publishEvents(
                advanceRevive(
                    actor,
                    (id) => world.getCharacter(id),
                    now,
                    context.random,
                    { ...context, now }
                )
            ),
        resolveHit: (now: number) => {
            actor.tickTimedState(now)
            publishEvents(resolvePendingAttackHit(attackContext(actor, now)))
        },
    }
}
