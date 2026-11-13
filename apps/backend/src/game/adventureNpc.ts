import type { GameCharacter } from './character'
import { distance } from './math'
import { canPerformSkillAction } from './skillProgression'

const interactionRadius = 48

export function resolveAdventureNpc(
    actor: GameCharacter,
    npcId: string | undefined,
    locationNPCs: GameCharacter[],
    now: number
): GameCharacter | undefined {
    return locationNPCs.find(
        (npc) =>
            npc.id === npcId &&
            npc.soul.canSpeak &&
            npc.controllerKind !== 'network_player' &&
            npc.faction === 'peaceful' &&
            canPerformSkillAction(actor, now) &&
            !actor.tags.has('state.retired') &&
            !npc.tags.has('offline') &&
            !npc.tags.has('state.retired') &&
            npc.alive &&
            actor.locationId === npc.locationId &&
            distance(actor.position, npc.position) <= interactionRadius
    )
}
