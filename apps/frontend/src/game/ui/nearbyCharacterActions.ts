import {
    canLearnDiscipline,
    type CharacterSnapshot,
    COMPANION_REQUEST_RANGE,
    type PartySnapshot,
    PERSONAL_HOSTILITY_RANGE,
    prayerAbilityIds,
    profileForPrayer,
    snapshotPrayerParameters,
} from '@my-game-ratata/contracts'

import { abilityName, characterName, tGame } from '@/shared/lib/i18n'

import { isDialogueCharacter } from '../runtime/runtimeQueries'
import { relation } from './combatTargeting'
import { interactionDistance } from './interactionTargets'
import { merchantServiceActions } from './merchantServiceActions'
import type { InteractionAction } from './nearbyInteractionActions'
import { invitationActions } from './partyActions'

export function characterActions(
    target: CharacterSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    if (target.id === player.id || !isDialogueCharacter(target)) return []
    const distance = interactionDistance(player, target)
    const requests = distance <= COMPANION_REQUEST_RANGE ? companionActions(target) : []
    if (distance > 48) return requests
    return [
        ...merchantServiceActions(target),
        ...requests,
        ...teacherActions(target, player),
        ...prayerLearningActions(target, player),
    ]
}

export function hostilityActions(
    target: CharacterSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    if (
        !target.alive ||
        target.life?.retired ||
        target.trainingTarget ||
        interactionDistance(player, target) > PERSONAL_HOSTILITY_RANGE
    )
        return []
    const hostile = target.personalHostile !== true
    return [
        {
            id: `personal-hostility:${target.id}`,
            label: tGame(hostile ? 'game.world.declareEnemy' : 'game.world.clearHostility'),
            command: { type: 'set_personal_hostility', targetId: target.id, hostile },
        },
    ]
}

export function civicServiceActions(
    target: CharacterSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    if (
        target.id !== 'npc_friendly_girl_1' ||
        !isDialogueCharacter(target) ||
        interactionDistance(player, target) > 48
    )
        return []
    return [
        {
            id: `city-affairs:${target.id}`,
            label: tGame('game.world.cityAffairs'),
            command: { type: 'interact', targetId: target.id, service: 'city_affairs' },
        },
    ]
}

function companionActions(target: CharacterSnapshot): InteractionAction[] {
    const availability = target.interactions?.companionRequests
    if (!availability) return []
    const occupied = availability === 'occupied'
    const actions: InteractionAction[] = [
        {
            id: `follow:${target.id}`,
            label: tGame('game.world.askToJoin', {
                name: characterName(target.id, target.nickname),
            }),
            disabled: occupied,
            command: { type: 'companion_request', targetId: target.id, request: 'follow' },
        },
    ]
    if (target.interactions?.companionCanFight === true)
        actions.push({
            id: `help:${target.id}`,
            label: tGame('game.world.askCombatHelp', {
                name: characterName(target.id, target.nickname),
            }),
            disabled: occupied,
            command: { type: 'companion_request', targetId: target.id, request: 'help' },
        })
    if (availability === 'own')
        actions.push(
            {
                id: `guard:${target.id}`,
                label: tGame('game.world.askToStay'),
                command: { type: 'companion_request', targetId: target.id, request: 'guard' },
            },
            {
                id: `dismiss:${target.id}`,
                label: tGame('game.world.dismissCompanion'),
                command: { type: 'companion_request', targetId: target.id, request: 'dismiss' },
            }
        )
    return actions
}
function teacherActions(target: CharacterSnapshot, player: CharacterSnapshot): InteractionAction[] {
    if (
        !target.tags.includes('scholar') ||
        !canLearnDiscipline(player.abilities?.known ?? [], 'magic')
    )
        return []
    const actions: InteractionAction[] = []
    if (!player.abilities?.known.includes('fireball'))
        actions.push({
            id: `learn:${target.id}`,
            label: tGame('game.world.learnFirebolt'),
            command: { type: 'learn_skill', skillId: 'fireball', targetId: target.id },
        })
    if ((player.progression?.magicChaptersRead ?? 0) < 3)
        actions.push({
            id: `study:${target.id}`,
            label: tGame('game.world.readMagicChapter'),
            command: { type: 'study_magic', targetId: target.id },
        })
    return actions
}
export function prayerLearningActions(
    target: CharacterSnapshot,
    player: CharacterSnapshot
): InteractionAction[] {
    if (
        !target.alive ||
        relation(target, player) === 'hostile' ||
        !canLearnDiscipline(player.abilities?.known ?? [], 'prayer')
    )
        return []
    return prayerAbilityIds
        .filter(
            (id) => target.abilities?.known.includes(id) && !player.abilities?.known.includes(id)
        )
        .map((abilityId) => ({
            id: `learn:${abilityId}:${target.id}`,
            label: tGame('game.world.learnAbility', { ability: abilityName(abilityId) }),
            command: { type: 'learn_ability', abilityId, targetId: target.id },
        }))
}
export function reviveActions(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): InteractionAction[] {
    const schools =
        player.progression?.resurrectionSchools ??
        (player.progression?.resurrectionUnlocked ? ['pray' as const] : [])
    return characters
        .filter(
            (target) =>
                !target.alive &&
                (target.life?.reviveMsLeft ?? 0) > 0 &&
                relation(target, player) !== 'hostile'
        )
        .flatMap((target) =>
            schools
                .filter(
                    (abilityId) =>
                        player.abilities?.known.includes(abilityId) &&
                        profileForPrayer(abilityId).reviveTypes.includes(target.creatureType) &&
                        interactionDistance(player, target) <=
                            snapshotPrayerParameters(player, abilityId).radius
                )
                .map<InteractionAction>((abilityId) => ({
                    id: `revive:${abilityId}:${target.id}`,
                    label: tGame('game.world.resurrectNamed', {
                        name: characterName(target.id, target.nickname),
                    }),
                    disabled: player.resourceChecks?.prayers[abilityId]?.revive !== 'ready',
                    command: {
                        type: 'use_ability',
                        abilityId,
                        intent: { mode: 'revive', targetId: target.id },
                    },
                }))
        )
        .slice(0, 1)
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
            label: tGame('game.world.followNamed', {
                name: characterName(target.id, target.nickname),
            }),
            command: { type: 'follow', targetId: target.id },
        }))
}

export function socialActions(
    characters: CharacterSnapshot[],
    player: CharacterSnapshot
): InteractionAction[] {
    return characters
        .filter(
            (target) =>
                target.id !== player.id && target.alive && interactionDistance(player, target) <= 48
        )
        .flatMap((target) => [
            ...(target.interactions?.whisper
                ? [
                      {
                          id: `whisper:${target.id}`,
                          label: tGame('game.world.whisperTo', {
                              name: characterName(target.id, target.nickname),
                          }),
                          command: { type: 'whisper_open' as const, targetId: target.id },
                      },
                  ]
                : []),
            ...(target.interactions?.exchange
                ? [
                      {
                          id: `exchange:${target.id}`,
                          label: tGame('game.world.tradeWith', {
                              name: characterName(target.id, target.nickname),
                          }),
                          command: { type: 'exchange_invite' as const, targetId: target.id },
                      },
                  ]
                : []),
        ])
}
