import type { QuestTurnInPromptSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { NpcQuestResult } from './npcQuests'
import type { QuestTurnInEnvironment } from './questTurnInRules'

function guildTurnIn(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    view: QuestTurnInPromptSnapshot,
    now: number
): NpcQuestResult {
    const events = environment.parties.handle(
        player,
        {
            type: view.action === 'report' ? 'guild_report' : 'guild_turn_in',
            instanceId: view.instanceId,
        },
        environment.characters(),
        now
    )
    const after = environment.parties
        .questHistory(view.issuerId, player.id)
        .find((job) => job.instanceId === view.instanceId)
    const accepted =
        view.action === 'report'
            ? after?.workRequest?.proofAccepted === true
            : after?.status === 'completed'
    return {
        accepted,
        error: accepted
            ? null
            : (environment.parties.snapshot(player.id).notice ??
              'Сдача пока недоступна.'),
        events,
    }
}

function storyTurnIn(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    issuer: GameCharacter,
    now: number
): NpcQuestResult {
    const characters = [...environment.characters()]
    const navigation = environment.navigationFor(player)
    const events = environment.adventure.interact(
        player,
        issuer.id,
        characters,
        navigation,
        now
    )
    events.push(
        ...environment.adventure.choose(
            player,
            'turn_in_trophies',
            characters,
            navigation,
            now
        )
    )
    const accepted =
        environment.adventure.snapshot(player.id, player.locationId, player)
            .quest.status === 'completed'
    environment.adventure.closeConversations(player.id)
    return {
        accepted,
        error: accepted ? null : 'Сдача пока недоступна.',
        events,
    }
}

/** Dispatches exactly the ordinary actor-resolved command; the model cannot confirm. */
export function executeQuestTurnIn(
    environment: QuestTurnInEnvironment,
    player: GameCharacter,
    issuer: GameCharacter,
    view: QuestTurnInPromptSnapshot,
    now: number
): NpcQuestResult {
    if (view.source === 'guild') {
        return guildTurnIn(environment, player, view, now)
    }
    if (view.source === 'story') {
        return storyTurnIn(environment, player, issuer, now)
    }
    return environment.quests.handle(
        player,
        { type: 'npc_quest_turn_in', instanceId: view.instanceId },
        now
    )
}
