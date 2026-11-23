import { type CharacterSnapshot, THEFT_RULES, type WorldSnapshot } from '@my-game-ratata/contracts'

import { characterName, tGame } from '@/shared/lib/i18n'

import type { InteractionAction } from './nearbyInteractionActions'

export function theftActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot,
    characters: CharacterSnapshot[]
): InteractionAction[] {
    if (!player.alive || !player.theft) return []
    const target = characters
        .filter(
            (character) =>
                character.id !== player.id && character.alive && !character.tags.includes('offline')
        )
        .map((character) => ({
            character,
            distance: Math.hypot(
                character.position.x - player.position.x,
                character.position.y - player.position.y
            ),
        }))
        .filter((candidate) => candidate.distance <= THEFT_RULES.range)
        .sort((first, second) => first.distance - second.distance)[0]?.character
    return target ? [stealAction(player, target, snapshot.serverTime)] : []
}

function stealAction(
    player: CharacterSnapshot,
    target: CharacterSnapshot,
    now: number
): InteractionAction {
    const lastAttempt = player.theft?.lastResult
    const pairWait =
        lastAttempt?.targetId === target.id
            ? Math.max(0, lastAttempt.at + THEFT_RULES.pairCooldownMs - now)
            : 0
    const wait = Math.max(player.theft?.cooldownMsLeft ?? 0, pairWait)
    return {
        id: `steal:${target.id}`,
        label: tGame('game.world.trySteal', {
            name: characterName(target.id, target.nickname),
            requirement: stealRequirement(player, wait),
        }),
        disabled:
            player.movement?.mode !== 'sneaking' ||
            wait > 0 ||
            player.resourceChecks?.steal !== 'ready',
        command: { type: 'steal', targetId: target.id },
    }
}

function stealRequirement(player: CharacterSnapshot, wait: number): string {
    if (player.movement?.mode !== 'sneaking') return tGame('game.world.sneakShortcut')
    return wait > 0
        ? tGame('game.world.availableIn', { seconds: String(Math.ceil(wait / 1000)) })
        : `${String(player.theft?.energyCost ?? THEFT_RULES.energyCost)} EN`
}

export function guardActions(
    snapshot: WorldSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    return (player.theft?.accusations ?? [])
        .filter(
            (accusation) => accusation.expiresAt > snapshot.serverTime && accusation.canCallGuards
        )
        .map((accusation) => ({
            id: `guards:${accusation.thiefId}`,
            label: tGame('game.world.callGuards', { name: accusation.thiefName }),
            command: { type: 'call_guards', targetId: accusation.thiefId },
        }))
}
