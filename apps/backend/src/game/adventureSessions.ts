import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
    closeConversationsFor,
    reconcileConversations,
} from './conversationSessions'
import type { NavigationService } from './navigation'

export function createAdventureSessions(
    states: ReadonlyMap<string, PlayerAdventure>
) {
    return {
        reconcile: (
            characters: Iterable<GameCharacter>,
            navigationFor: (actor: GameCharacter) => NavigationService,
            urgentThreat?: (npc: GameCharacter) => boolean
        ) =>
            reconcileConversations(
                states,
                characters,
                navigationFor,
                urgentThreat
            ),
        close: (characterId: string) =>
            closeConversationsFor(states, characterId),
        hasCompletedQuest: (actorId: string, questId: string) =>
            questId === 'hearts-for-the-border-bell' &&
            states.get(actorId)?.questStatus === 'completed',
    }
}
