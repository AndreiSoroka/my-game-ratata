import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { buildAbilityAttackZones, isInZones } from './combatGeometry'
import type { CompanionRuntime } from './companionMovement'
import { effectiveAbility } from './effectiveParameters'
import { effectiveMaxEnergy } from './effectiveResources'
import { previewPrayer } from './prayerContext'

/** Leia supports her own consenting leader through the normal Road prayer. */
export function supportCompanionLeader(
    character: GameCharacter,
    leader: GameCharacter | undefined,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): GameEventPayload[] {
    if (
        character.id !== 'npc_princess_1' ||
        leader === undefined ||
        (state.order !== 'follow' && state.order !== 'help') ||
        world.abilityContextFor === undefined ||
        world.requestAbility === undefined ||
        leader.energy >= effectiveMaxEnergy(leader) / 2
    ) {
        return []
    }
    const context = world.abilityContextFor(character, now)
    const preview = previewPrayer(character, context, leader.id, 'pray_road')
    if (
        preview.unavailableReason !== null ||
        preview.intent?.mode !== 'restore'
    ) {
        return []
    }
    return world.requestAbility(
        character,
        {
            type: 'use_ability',
            abilityId: 'pray_road',
            intent: preview.intent,
        },
        now
    )
}

export function sightForCompanion(
    character: GameCharacter,
    state: CompanionRuntime,
    world: CompanionWorld
): number {
    if (
        character.id === 'npc_veteran_1' &&
        character.abilities.known.has('shot')
    ) {
        return Math.max(
            112,
            effectiveAbility(
                character,
                'shot',
                world.navigationFor(character).grid.tileWidth
            ).range
        )
    }
    return state.profile.stationary ? 64 : 112
}

export function tryCompanionShot(
    character: GameCharacter,
    target: GameCharacter,
    world: CompanionWorld,
    now: number
): GameEventPayload[] | undefined {
    if (
        character.id !== 'npc_veteran_1' ||
        !character.abilities.known.has('shot') ||
        world.requestAbility === undefined ||
        !isInZones(
            target,
            buildAbilityAttackZones(
                character,
                'shot',
                world.navigationFor(character).grid.tileWidth
            )
        )
    ) {
        return undefined
    }
    if (character.pendingAttack !== undefined) {
        return []
    }
    const events = world.requestAbility(
        character,
        { type: 'use_ability', abilityId: 'shot', targetId: target.id },
        now
    )
    if (!events.some((event) => event.kind === 'attack')) {
        return undefined
    }
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
    return events
}
