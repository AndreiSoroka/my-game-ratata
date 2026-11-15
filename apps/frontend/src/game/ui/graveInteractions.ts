import {
    type CharacterSnapshot,
    GRAVE_INTERACTION_RANGE,
    GRAVE_PURIFY_MANA_COST,
    gravePurifyCastMs,
    type PrayerPreview,
    type WorldChestSnapshot,
    type WorldGraveSnapshot,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

import { chestActions } from './chestActions'
import { interactionDistance } from './interactionTargets'
import type { InteractionAction, InteractionTarget } from './nearbyInteractionActions'

export function graveName(grave: WorldGraveSnapshot): string {
    return { active: 'Могила', ruined: 'Разрушенная могила', purified: 'Очищенная могила' }[
        grave.phase
    ]
}

/** Explicit selection only: an ordinary prayer never searches nearby graves. */
export function gravePrayerPreview(
    player: CharacterSnapshot,
    grave: WorldGraveSnapshot,
    canReach = true
): PrayerPreview {
    return {
        intent: { mode: 'purify_grave', target: { kind: 'grave', id: grave.id } },
        manaCost: GRAVE_PURIFY_MANA_COST,
        harmfulTargets: 0,
        includesAllies: false,
        includesSelf: false,
        unavailableReason: purificationUnavailable(player, grave, canReach),
    }
}

function purificationUnavailable(
    player: CharacterSnapshot,
    grave: WorldGraveSnapshot,
    canReach: boolean
): string | null {
    if (grave.phase === 'purified') return 'Могила уже очищена'
    const requirement = purificationQualification(player)
    if (requirement) return requirement
    const availability = prayerAvailability(player)
    if (availability) return availability
    if (!canReach || interactionDistance(player, grave) > GRAVE_INTERACTION_RANGE)
        return 'Подойдите ближе к могиле'
    return null
}
function purificationQualification(player: CharacterSnapshot): string | null {
    if (!player.abilities?.known.includes('pray')) return 'Нужно изучить молитву'
    const miracles = player.progression?.skills.find((skill) => skill.id === 'miracles')?.level ?? 0
    if (player.heroClass !== 'cleric' && miracles < 5) return 'Нужен жрец или Чудеса 5'
    return null
}
function prayerAvailability(player: CharacterSnapshot): string | null {
    if (!player.alive || player.cooldowns.stunMsLeft > 0 || player.abilities?.casting)
        return 'Сейчас нельзя молиться'
    if ((player.abilities?.cooldowns.pray ?? 0) > 0) return 'Молитва восстанавливается'
    if (player.resourceChecks?.prayers.purify_grave !== 'ready') return 'Нужно 20 MP'
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
            label: grave.phase === 'active' ? 'Атаковать могилу' : 'Могила разрушена',
            disabled: grave.phase !== 'active',
            command: { type: 'attack', target: { kind: 'grave', id: grave.id } },
        },
        {
            id: `grave:purify:${grave.id}`,
            label:
                preview.unavailableReason ??
                `Упокоить могилу · ${GRAVE_PURIFY_MANA_COST} MP · ${gravePurifyCastMs(grave.phase) / 1000} с`,
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
                interactionDistance(player, grave) <= GRAVE_INTERACTION_RANGE
        )
        .map((grave) => ({
            key: `grave:${grave.id}`,
            kind: 'object',
            name: graveName(grave),
            position: grave.position,
            bounds: { x: grave.position.x - 8, y: grave.position.y - 8, width: 16, height: 16 },
            range: GRAVE_INTERACTION_RANGE,
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
