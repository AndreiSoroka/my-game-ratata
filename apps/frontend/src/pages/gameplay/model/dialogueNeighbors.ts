import type { CharacterSnapshot, WorldSnapshot } from '@my-game-ratata/contracts'

import type { DialogueNeighbors } from '@/entities/dialogues'

import { relation } from '../../../game/ui/combatTargeting'
import {
    type InteractionTarget,
    nearbyCharacterInteractionTargets,
    nearbyInteractionTarget,
} from '../../../game/ui/nearbyInteractionActions'

type AvailabilityChecks = Parameters<typeof nearbyCharacterInteractionTargets>

export function availableDialogueTargets(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    isPositionVisible?: AvailabilityChecks[3],
    canSelectTarget?: AvailabilityChecks[4]
): InteractionTarget[] {
    return nearbyCharacterInteractionTargets(
        snapshot,
        player,
        characters.filter(
            (character) =>
                character.alive &&
                !character.life?.retired &&
                relation(character, player) !== 'hostile'
        ),
        isPositionVisible,
        canSelectTarget
    )
}

export function dialogueNeighbors(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[],
    currentKey: string,
    isPositionVisible?: AvailabilityChecks[3],
    canSelectTarget?: AvailabilityChecks[4]
): DialogueNeighbors {
    if (!currentKey.startsWith('character:')) return {}
    const targets = availableDialogueTargets(
        snapshot,
        player,
        characters,
        isPositionVisible,
        canSelectTarget
    )
    if (!targets.some(({ key }) => key === currentKey)) {
        const current = nearbyInteractionTarget(
            snapshot,
            player,
            characters,
            isPositionVisible,
            currentKey,
            true,
            canSelectTarget
        )
        if (!current || current.kind !== 'character') return {}
        targets.push(current)
    }
    targets.sort(
        (a, b) =>
            a.position.x - b.position.x || a.position.y - b.position.y || a.key.localeCompare(b.key)
    )
    const current = targets.findIndex(({ key }) => key === currentKey)
    const left = targets[current - 1]
    const right = targets[current + 1]
    return {
        ...(left && { left: { key: left.key, name: left.name } }),
        ...(right && { right: { key: right.key, name: right.name } }),
    }
}
