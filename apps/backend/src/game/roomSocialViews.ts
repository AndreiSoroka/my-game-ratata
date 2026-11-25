import type { SocialSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { usesHerbExchangePolicy } from './cityHerbExchange'
import type { ExchangeService } from './exchange'
import type { NpcQuestService } from './npcQuests'
import { npcDialogueMode } from './npcRoster'
import type { QuestTurnInService } from './questTurnIn'
import type { RoomCommunication } from './roomCommunication'
import type { RoomNpcConversations } from './roomNpcConversations'
import type { WhisperService } from './whispers'

export function projectCharacterInteractions(
    actor: GameCharacter,
    model: boolean
) {
    const mode = npcDialogueMode(actor.id)
    return {
        aiDialogue: model,
        ...(actor.controllerKind === 'network_player'
            ? {}
            : { dialogueMode: mode }),
        whisper:
            actor.soul.canSpeak &&
            (actor.controllerKind === 'network_player' || model),
        exchange:
            actor.soul.canSpeak &&
            (actor.controllerKind === 'network_player'
                ? actor.connected
                : usesHerbExchangePolicy(actor, model) ||
                  (model && mode !== 'passive')),
    }
}

export function createRoomSocialSnapshot(
    exchanges: ExchangeService,
    quests: NpcQuestService,
    turnIns: QuestTurnInService,
    communication: RoomCommunication,
    turns: RoomNpcConversations,
    whispers: WhisperService
) {
    return (actor: GameCharacter, now: number): SocialSnapshot => {
        const exchange = exchanges.snapshot(actor.id)
        const questView = quests.snapshot(actor.id, now)
        const questTurnIn = turnIns.snapshot(actor, now)
        const partnerId =
            questTurnIn?.issuerId ??
            questView.questOffer?.issuerId ??
            (exchange !== null &&
            ['active', 'invited'].includes(exchange.status)
                ? exchange.partnerId
                : undefined)
        const activity = communication.snapshot(actor, now)
        const npcActivity = turns.activity(actor, now)
        return {
            exchange,
            privateMessages: whispers.heardMessages(actor.id, true),
            ...turns.departures.snapshot(actor, now),
            ...activity,
            speechActivity: [
                ...(activity.speechActivity ?? []).filter(
                    (activity) =>
                        !npcActivity.some(
                            (npc) => npc.actorId === activity.actorId
                        )
                ),
                ...npcActivity,
            ],
            whisper: whispers.snapshot(actor, now, partnerId, true),
            ...questView,
            questTurnIn,
        }
    }
}
