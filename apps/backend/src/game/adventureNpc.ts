import type { NpcInteractionService } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import { CONVERSATION_REACH } from './conversationSessions'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { canPerformSkillAction } from './skillProgression'
import { canConverseWithNpc } from './socialSpeech'

export function conversationalNpcService(
    service: NpcInteractionService | undefined
): boolean {
    return (
        service === undefined ||
        service === 'city_affairs' ||
        service === 'worker_requests'
    )
}

export function resolveAdventureNpc(
    actor: GameCharacter,
    npcId: string | undefined,
    locationNPCs: GameCharacter[],
    now: number,
    navigation?: NavigationService,
    allowSpeechAcrossFurniture = false
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
            (navigation === undefined ||
                navigation.hasLineOfSight(actor.position, npc.position) ||
                (allowSpeechAcrossFurniture &&
                    canConverseWithNpc(
                        actor,
                        npc,
                        navigation,
                        now,
                        CONVERSATION_REACH
                    )))
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
