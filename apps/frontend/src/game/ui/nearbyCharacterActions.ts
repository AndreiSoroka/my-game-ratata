import type { CharacterSnapshot, PartySnapshot } from '@my-game-ratata/contracts'

import { isDialogueCharacter } from '../runtime/runtimeQueries'
import { relation } from './combatTargeting'
import { interactionDistance } from './interactionTargets'
import { merchantServiceActions } from './merchantServiceActions'
import type { InteractionAction } from './nearbyInteractionActions'
import { invitationActions } from './partyActions'

export function characterActions(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): InteractionAction[] {
    const target = characters
        .filter(
            (character) =>
                character.id !== player.id &&
                isDialogueCharacter(character) &&
                interactionDistance(player, character) <= 48
        )
        .sort(
            (first, second) =>
                interactionDistance(player, first) - interactionDistance(player, second)
        )[0]
    if (!target) return []
    return [
        ...merchantServiceActions(target),
        {
            id: `talk:${target.id}`,
            label: `Поговорить: ${target.nickname}`,
            command: { type: 'interact', targetId: target.id },
        },
        ...companionActions(target, player),
        ...teacherActions(target, player),
    ]
}
function companionActions(
    target: CharacterSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    const companion = target.soul?.companion
    if (!companion) return []
    const occupied = companion.leaderId !== null && companion.leaderId !== player.id
    const actions: InteractionAction[] = [
        {
            id: `follow:${target.id}`,
            label: `Попросить идти вместе: ${target.nickname}`,
            disabled: occupied,
            command: { type: 'companion_request', targetId: target.id, request: 'follow' },
        },
        {
            id: `help:${target.id}`,
            label: `Попросить помочь в бою: ${target.nickname}`,
            disabled: occupied,
            command: { type: 'companion_request', targetId: target.id, request: 'help' },
        },
    ]
    if (companion.leaderId === player.id)
        actions.push(
            {
                id: `guard:${target.id}`,
                label: 'Попросить остаться здесь',
                command: { type: 'companion_request', targetId: target.id, request: 'guard' },
            },
            {
                id: `dismiss:${target.id}`,
                label: 'Отпустить спутника',
                command: { type: 'companion_request', targetId: target.id, request: 'dismiss' },
            }
        )
    return actions
}
function teacherActions(target: CharacterSnapshot, player: CharacterSnapshot): InteractionAction[] {
    if (!target.tags.includes('scholar')) return []
    const actions: InteractionAction[] = []
    if (!player.progression?.skills.some((skill) => skill.id === 'fireball' && skill.unlocked))
        actions.push({
            id: `learn:${target.id}`,
            label: 'Изучить огненный шар',
            command: { type: 'learn_skill', skillId: 'fireball', targetId: target.id },
        })
    if ((player.progression?.magicChaptersRead ?? 0) < 3)
        actions.push({
            id: `study:${target.id}`,
            label: 'Читать главу о магии',
            command: { type: 'study_magic', targetId: target.id },
        })
    return actions
}
export function reviveActions(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): InteractionAction[] {
    if (!player.progression?.resurrectionUnlocked) return []
    return characters
        .filter(
            (character) =>
                !character.alive &&
                (character.life?.reviveMsLeft ?? 0) > 0 &&
                character.faction === player.faction &&
                interactionDistance(player, character) <= 48
        )
        .sort((a, b) => interactionDistance(player, a) - interactionDistance(player, b))
        .slice(0, 1)
        .map<InteractionAction>((character) => ({
            id: `revive:${character.id}`,
            label: `Воскресить: ${character.nickname}`,
            disabled: player.resources.mana < 20,
            command: { type: 'revive', targetId: character.id },
        }))
}
export function partyActions(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot,
    party?: PartySnapshot
): InteractionAction[] {
    return characters
        .filter((target) => interactionDistance(player, target) <= 48)
        .flatMap((target) => invitationActions(player, target, party))
}
export function followActions(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): InteractionAction[] {
    return characters
        .filter(
            (target) =>
                target.id !== player.id &&
                target.alive &&
                relation(target, player) !== 'hostile' &&
                interactionDistance(player, target) <= 48
        )
        .map((target) => ({
            id: `self-follow:${target.id}`,
            label: `Следовать за ${target.nickname}`,
            command: { type: 'follow', targetId: target.id },
        }))
}
