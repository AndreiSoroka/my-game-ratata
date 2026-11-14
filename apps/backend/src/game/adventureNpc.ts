import type { GameCharacter } from './character'
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
            npc.soul.canSpeak &&
            npc.controllerKind !== 'network_player' &&
            npc.faction === 'peaceful' &&
            canPerformSkillAction(actor, now) &&
            !actor.tags.has('state.retired') &&
            npcAvailable(npc) &&
            actor.locationId === npc.locationId &&
            distance(actor.position, npc.position) <= CONVERSATION_REACH &&
            (navigation?.hasLineOfSight(actor.position, npc.position) ?? true)
    )
}

function npcAvailable(npc: GameCharacter): boolean {
    return (
        npc.alive && !npc.tags.has('offline') && !npc.tags.has('state.retired')
    )
}
