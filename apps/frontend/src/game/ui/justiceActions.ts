import { type CharacterSnapshot, THEFT_RULES, type WorldSnapshot } from '@my-game-ratata/contracts'

import { tGame } from '@/shared/lib/i18n'

import type { InteractionAction } from './nearbyInteractionActions'

export function justiceActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[]
): InteractionAction[] {
    if (!player.alive) return []
    return [
        ...reportActions(snapshot, player, characters),
        ...absolutionActions(snapshot, player, characters),
    ]
}
function reportActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[]
): InteractionAction[] {
    const actions: InteractionAction[] = []
    const guard = nearestService(characters, player, 'guard', THEFT_RULES.reportRange)
    if (snapshot.location?.biome === 'city' && guard && player.soul?.canSpeak)
        for (const proof of player.theft?.accusations ?? [])
            if (!proof.reported && proof.expiresAt > snapshot.serverTime)
                actions.push({
                    id: `report:${proof.thiefId}`,
                    label: tGame('game.world.reportThief', { name: proof.thiefName }),
                    command: { type: 'report_theft', targetId: proof.thiefId },
                })
    return actions
}
function absolutionActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[]
): InteractionAction[] {
    const actions: InteractionAction[] = []
    const cleric = nearestService(characters, player, 'cleric', THEFT_RULES.absolutionRange)
    if (player.theft?.blacklisted && cleric)
        actions.push({
            id: `absolve:${cleric.id}`,
            label: tGame('game.world.askAbsolution', { gold: String(THEFT_RULES.absolutionGold) }),
            disabled: (snapshot.adventure?.gold ?? 0) < THEFT_RULES.absolutionGold,
            command: { type: 'absolve', targetId: cleric.id },
        })
    return actions
}
function nearestService(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot,
    role: string,
    range: number
): CharacterSnapshot | undefined {
    return characters
        .filter(
            (character) =>
                character.id !== player.id &&
                character.alive &&
                !character.tags.includes('offline') &&
                character.tags.includes(role)
        )
        .map((character) => ({
            character,
            distance: Math.hypot(
                character.position.x - player.position.x,
                character.position.y - player.position.y
            ),
        }))
        .filter((candidate) => candidate.distance <= range)
        .sort((a, b) => a.distance - b.distance)[0]?.character
}
