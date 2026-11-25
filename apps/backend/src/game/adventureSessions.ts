import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
    closeConversationsFor,
    reconcileConversations,
} from './conversationSessions'
import type { NavigationService } from './navigation'

export function createAdventureSessions(
    states: ReadonlyMap<string, PlayerAdventure>,
    canReadQuestBoard: NonNullable<Parameters<typeof reconcileConversations>[4]>
) {
    return {
        reconcile: (
            characters: Iterable<GameCharacter>,
            navigationFor: (actor: GameCharacter) => NavigationService,
            urgentThreat?: (npc: GameCharacter) => boolean,
            now?: number
        ) =>
            reconcileConversations(
                states,
                characters,
                navigationFor,
                urgentThreat,
                canReadQuestBoard,
                now
            ),
        close: (characterId: string) =>
            closeConversationsFor(states, characterId),
        hasCompletedQuest: (actorId: string, questId: string) =>
            questId === 'hearts-for-the-border-bell' &&
            states.get(actorId)?.questStatus === 'completed',
    }
}
