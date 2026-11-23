import {
    ABILITY_DEFINITIONS,
    ASH_RITE_RULES,
    ASH_RULES,
    MASTERY_XP_SCALE,
} from '@my-game-ratata/contracts'

import { ashSkeletonOrder, ashSummoner, hasAshGift } from './ashSkeletonState'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { necromancerCanPray } from './necromancerActions'
import type {
    NecromancerOption,
    NecromancerScene,
    NecromancerTactic,
} from './necromancerTactics'
import type { GameRoom } from './room'

export interface NecromancerPreferences {
    favoriteId: string | undefined
    questChest?: string
    offeredHelp: ReadonlySet<string>
}

export function necromancerOptions(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    preferences: NecromancerPreferences,
    now: number
): NecromancerOption[] {
    return [
        ...environmentChoices(actor, scene, preferences),
        ...localNecromancerOptions(actor, room, scene, now),
        ...nearbyAlliedSkeletons(actor, scene, now).flatMap((skeleton) => [
            ...orderChoices(actor, scene, skeleton),
            ...skeletonChoices(actor, skeleton, preferences.favoriteId),
        ]),
    ]
}

export function localNecromancerOptions(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    now: number
): NecromancerOption[] {
    return [
        ...prayerChoices(actor, room, scene, now),
        ...raiseChoices(actor, scene, now),
    ]
}

function environmentChoices(
    actor: GameCharacter,
    scene: NecromancerScene,
    { offeredHelp, questChest }: NecromancerPreferences
): NecromancerOption[] {
    if (scene.threat !== undefined) {
        const combat: NecromancerOption[] = [
            { tactic: 'fight', targetId: scene.threat.id },
            { tactic: 'retreat' },
        ]
        if (scene.cover?.concealed === true) {
            combat.push({ tactic: 'hide' })
        }
        return combat
    }
    const peace: NecromancerOption[] = [{ tactic: 'study' }, { tactic: 'rest' }]
    if (scene.playerId !== undefined && !offeredHelp.has(scene.playerId)) {
        peace.push(
            { tactic: 'offer_help', targetId: scene.playerId },
            { tactic: 'keep_distance' }
        )
    }
    if (
        questChest !== undefined &&
        actor.abilities.known.has('ash_heart') &&
        !actor.lichHeartBound
    ) {
        peace.push({ tactic: 'heart', targetId: questChest })
    }
    return peace
}

function prayerChoices(
    actor: GameCharacter,
    room: GameRoom,
    scene: NecromancerScene,
    now: number
): NecromancerOption[] {
    const wounded = [...scene.visible, actor].find((target) =>
        necromancerCanPray(
            actor,
            room,
            { mode: 'restore', targetId: target.id },
            now
        )
    )
    const fallen = scene.visible.find((target) =>
        necromancerCanPray(
            actor,
            room,
            { mode: 'revive', targetId: target.id },
            now
        )
    )
    const choices: NecromancerOption[] = []
    if (fallen !== undefined) {
        choices.push({ tactic: 'revive', targetId: fallen.id })
    }
    if (wounded !== undefined) {
        choices.push({ tactic: 'heal', targetId: wounded.id })
    }
    if (
        scene.threat !== undefined &&
        necromancerCanPray(
            actor,
            room,
            { mode: 'harm', targetId: scene.threat.id },
            now
        )
    ) {
        choices.push({ tactic: 'magic', targetId: scene.threat.id })
    }
    return choices
}

function raiseChoices(
    actor: GameCharacter,
    scene: NecromancerScene,
    now: number
): NecromancerOption[] {
    return scene.corpseId !== undefined &&
        actor.mana >= ASH_RULES.raiseMana &&
        (actor.abilities.availableAt.ash_raise ?? 0) <= now
        ? [{ tactic: 'raise', targetId: scene.corpseId }]
        : []
}

function nearbyAlliedSkeletons(
    actor: GameCharacter,
    scene: NecromancerScene,
    now: number
): GameCharacter[] {
    return scene.visible
        .filter(
            (target) =>
                target.alive &&
                target.archetype === 'skeleton' &&
                target.controllerKind === 'mob1' &&
                target.soul.controlSource === 'script' &&
                !canTargetByFaction(actor, target, now) &&
                !canTargetByFaction(target, actor, now) &&
                belongsToNecromancer(actor, target) &&
                distance(actor.position, target.position) <=
                    ABILITY_DEFINITIONS.ash_order.range
        )
        .slice(0, 3)
}

export function availableSlimeHunter(
    actor: GameCharacter,
    scene: NecromancerScene,
    now: number
): NecromancerOption | undefined {
    if (
        !actor.abilities.known.has('ash_order') ||
        scene.threat?.creatureType !== 'ooze'
    ) {
        return undefined
    }
    const skeleton = nearbyAlliedSkeletons(actor, scene, now).find(
        (target) => ashSkeletonOrder(target)?.kind !== 'hunt_slimes'
    )
    return skeleton === undefined
        ? undefined
        : { tactic: 'hunt', targetId: skeleton.id }
}

function belongsToNecromancer(
    actor: GameCharacter,
    skeleton: GameCharacter
): boolean {
    const owner = ashSummoner(skeleton) ?? ashSkeletonOrder(skeleton)?.ownerId
    return owner === undefined || owner === actor.id
}

function orderChoices(
    actor: GameCharacter,
    scene: NecromancerScene,
    skeleton: GameCharacter
): NecromancerOption[] {
    const order = ashSkeletonOrder(skeleton)
    if (
        !actor.abilities.known.has('ash_order') ||
        (order !== undefined && order.ownerId !== actor.id)
    ) {
        return []
    }
    const tactics: NecromancerTactic[] = ['guard', 'protect'].filter(
        (tactic): tactic is 'guard' | 'protect' => tactic !== order?.kind
    )
    if (order !== undefined) {
        tactics.push('wander')
    }
    if (canHuntSlimes(scene, order?.kind)) {
        tactics.push('hunt')
    }
    return tactics.map((tactic) => ({ tactic, targetId: skeleton.id }))
}

function canHuntSlimes(
    scene: NecromancerScene,
    currentOrder: string | undefined
): boolean {
    return (
        currentOrder !== 'hunt_slimes' && scene.threat?.creatureType === 'ooze'
    )
}

function skeletonChoices(
    actor: GameCharacter,
    skeleton: GameCharacter,
    favoriteId: string | undefined
): NecromancerOption[] {
    const tactics: NecromancerTactic[] = []
    if (favoriteId !== skeleton.id) {
        tactics.push('favorite')
    }
    if (
        !hasAshGift(skeleton) &&
        distance(actor.position, skeleton.position) <=
            ABILITY_DEFINITIONS.ash_gift.range
    ) {
        if (
            actor.abilities.known.has('ash_gift') &&
            actor.progression.masteries.prayer_grave.experience >=
                BigInt(ASH_RITE_RULES.giftXp) * MASTERY_XP_SCALE
        ) {
            tactics.push('gift')
        }
        if (actor.abilities.known.has('ash_sacrifice')) {
            tactics.push('sacrifice')
        }
    }
    return tactics.map((tactic) => ({ tactic, targetId: skeleton.id }))
}
