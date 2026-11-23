import {
    type CharacterSnapshot,
    GRAVE_INTERACTION_RANGE,
    gravePurifyCastMs,
    isMotherPrayer,
    type PrayerActionId,
    type PrayerPreview,
    previewPrayerFromSnapshots,
    snapshotPrayerParameters,
    type WorldChestSnapshot,
    type WorldGraveSnapshot,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import { chestActions } from './chestActions'
import { interactionDistance } from './interactionTargets'
import type { InteractionAction, InteractionTarget } from './nearbyInteractionActions'

export function graveName(grave: WorldGraveSnapshot): string {
    return {
        active: tGame('game.world.grave'),
        ruined: tGame('game.world.destroyedGrave'),
        purified: tGame('game.world.cleansedGrave'),
    }[grave.phase]
}

/** Explicit selection pins the grave even while the ordinary prayer preview changes. */
export function gravePrayerPreview(
    player: CharacterSnapshot,
    grave: WorldGraveSnapshot,
    canReach = true,
    characters: readonly CharacterSnapshot[] = [],
    canReachCharacter?: (target: CharacterSnapshot) => boolean,
    abilityId: PrayerActionId = 'pray'
): PrayerPreview {
    const parameters = snapshotPrayerParameters(player, abilityId)
    if (!isMotherPrayer(abilityId))
        return {
            abilityId,
            intent: null,
            manaCost: parameters.manaCost,
            radius: parameters.radius,
            durationMs: parameters.durationMs,
            harmfulTargets: 0,
            includesAllies: false,
            includesSelf: false,
            unavailableReason: tGame('game.world.prayerCannotCleanse'),
        }
    const wave = previewPrayerFromSnapshots(player, characters, grave.id, {
        abilityId,
        canReach: canReachCharacter,
        graves: [grave],
        canReachGrave: () => canReach,
    })
    return {
        abilityId,
        intent: { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } },
        manaCost: parameters.manaCost,
        radius: snapshotPrayerParameters(player, 'pray').radius,
        durationMs: parameters.durationMs,
        harmfulTargets: abilityId === 'pray_woven' ? wave.harmfulTargets : 0,
        harmfulTargetIds: abilityId === 'pray_woven' ? wave.harmfulTargetIds : [],
        includesAllies: abilityId === 'pray_woven' && wave.includesAllies,
        includesSelf: abilityId === 'pray_woven' && wave.includesSelf,
        ...(parameters.cost === undefined ? {} : { cost: parameters.cost }),
        unavailableReason: purificationUnavailable(player, grave, canReach, abilityId),
    }
}

function purificationUnavailable(
    player: CharacterSnapshot,
    grave: WorldGraveSnapshot,
    canReach: boolean,
    abilityId: PrayerActionId = 'pray'
): string | null {
    if (grave.phase === 'purified') return tGame('game.world.alreadyCleansed')
    const requirement = purificationQualification(player)
    if (requirement) return requirement
    const availability = prayerAvailability(player, abilityId)
    if (availability) return availability
    if (
        !canReach ||
        interactionDistance(player, grave) > snapshotPrayerParameters(player, 'pray').radius
    )
        return tGame('game.world.approachGrave')
    return null
}
function purificationQualification(player: CharacterSnapshot): string | null {
    if (!player.abilities?.known.includes('pray')) return tGame('game.world.learnPrayerFirst')
    return null
}
function prayerAvailability(player: CharacterSnapshot, abilityId: PrayerActionId): string | null {
    if (!player.alive || player.cooldowns.stunMsLeft > 0 || player.abilities?.casting)
        return tGame('game.world.cannotPray')
    if ((player.abilities?.cooldowns[abilityId] ?? 0) > 0) return tGame('game.world.prayerCooldown')
    if (player.resourceChecks?.prayers[abilityId]?.purify_grave !== 'ready')
        return tGame('game.world.prayerNotEnoughMana')
    return null
}

export function graveActions(
    player: CharacterSnapshot,
    grave: WorldGraveSnapshot
): InteractionAction[] {
    const preview = gravePrayerPreview(player, grave)
    return [
        {
            id: `grave:attack:${grave.id}`,
            label:
                grave.phase === 'active'
                    ? tGame('game.world.attackGrave')
                    : tGame('game.world.graveDestroyed'),
            disabled: grave.phase !== 'active',
            command: { type: 'attack', target: { kind: 'grave', id: grave.id } },
        },
        {
            id: `grave:purify:${grave.id}`,
            label:
                preview.unavailableReason ??
                tGame('game.world.cleanseGraveCosts', {
                    mana: preview.manaCost,
                    seconds: (preview.durationMs ?? gravePurifyCastMs(grave.phase)) / 1000,
                }),
            disabled: preview.unavailableReason !== null,
            command: {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } },
            },
        },
    ]
}

export function graveTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot
): (InteractionTarget & { range: number })[] {
    return (snapshot.graves ?? [])
        .filter(
            (grave) =>
                grave.phase !== 'purified' &&
                interactionDistance(player, grave) <=
                    snapshotPrayerParameters(player, 'pray').radius
        )
        .map((grave) => ({
            key: `grave:${grave.id}`,
            kind: 'object',
            name: graveName(grave),
            position: grave.position,
            bounds: { x: grave.position.x - 8, y: grave.position.y - 8, width: 16, height: 16 },
            range: snapshotPrayerParameters(player, 'pray').radius,
            actions: [
                ...graveActions(player, grave),
                ...snapshot.chests
                    .filter((chest) => corpseSharesGrave(chest, grave, player))
                    .flatMap((chest) => chestActions({ ...snapshot, chests: [chest] }, player)),
            ],
        }))
}

/** One physical interaction surface, with each corpse retaining its own command identity. */
export function corpseSharesGrave(
    chest: WorldChestSnapshot,
    grave: WorldGraveSnapshot,
    player: CharacterSnapshot
): boolean {
    return (
        chest.kind === 'corpse' &&
        grave.phase !== 'purified' &&
        chest.position.x === grave.position.x &&
        chest.position.y === grave.position.y &&
        interactionDistance(player, grave) <= GRAVE_INTERACTION_RANGE
    )
}
