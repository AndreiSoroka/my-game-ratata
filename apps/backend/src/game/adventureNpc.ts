import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { CONVERSATION_REACH } from './conversationSessions'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { canPerformSkillAction } from './skillProgression'

export function resolveAdventureNpc(
    actor: GameCharacter,
    npcId: string | undefined,
    locationNPCs: GameCharacter[],
    now: number,
    navigation?: NavigationService
): GameCharacter | undefined {
    return locationNPCs.find(
        (npc) =>
            npc.id === npcId &&
            canPerformSkillAction(actor, now) &&
            !actor.tags.has('state.retired') &&
            speakingNpcAvailable(npc) &&
            actor.locationId === npc.locationId &&
            distance(actor.position, npc.position) <= CONVERSATION_REACH &&
            canObserveRoomCharacter(actor, npc, navigation, now) &&
            (navigation?.hasLineOfSight(actor.position, npc.position) ?? true)
    )
}

function speakingNpcAvailable(npc: GameCharacter): boolean {
    return (
        npc.soul.canSpeak &&
        npc.controllerKind !== 'network_player' &&
        npc.faction === 'peaceful' &&
        npc.alive &&
        !npc.tags.has('offline') &&
        !npc.tags.has('state.retired')
    )
}
