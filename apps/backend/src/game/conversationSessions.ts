import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'

export const CONVERSATION_REACH = 48

export function closeConversationsFor(
    states: ReadonlyMap<string, PlayerAdventure>,
    characterId: string
): void {
    for (const [actorId, state] of states) {
        if (actorId === characterId || state.dialogue?.npcId === characterId) {
            state.dialogue = null
        }
    }
}

/** Reconcile before controllers, so stale UI cannot keep an NPC's scenario paused. */
export function reconcileConversations(
    states: ReadonlyMap<string, PlayerAdventure>,
    characters: Iterable<GameCharacter>,
    navigationFor: (actor: GameCharacter) => NavigationService,
    urgentThreat: (npc: GameCharacter) => boolean = () => false
): Set<string> {
    const actors = new Map([...characters].map((actor) => [actor.id, actor]))
    const held = new Set<string>()
    for (const [actorId, state] of states) {
        const dialogue = state.dialogue
        if (dialogue === null || dialogue.kind === 'sign') {
            continue
        }
        const actor = actors.get(actorId)
        const npc = actors.get(dialogue.npcId)
        if (actor?.controllerKind !== 'network_player') {
            state.dialogue = null
            continue
        }
        if (
            !available(npc) ||
            !conversationAvailable(actor, npc, navigationFor) ||
            urgentThreat(npc)
        ) {
            state.dialogue = null
            continue
        }
        npc.setMoveInput({ x: 0, y: 0 })
        npc.clearPath()
        if (!held.has(npc.id)) {
            npc.updateFacing({
                x: actor.position.x - npc.position.x,
                y: actor.position.y - npc.position.y,
            })
        }
        held.add(npc.id)
    }
    return held
}

function available(actor: GameCharacter | undefined): actor is GameCharacter {
    return (
        actor !== undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}

function conversationAvailable(
    actor: GameCharacter | undefined,
    npc: GameCharacter | undefined,
    navigationFor: (actor: GameCharacter) => NavigationService
): actor is GameCharacter {
    return (
        available(actor) &&
        available(npc) &&
        (actor.controllerKind !== 'network_player' || actor.connected) &&
        actor.locationId === npc.locationId &&
        distance(actor.position, npc.position) <= CONVERSATION_REACH &&
        navigationFor(actor).hasLineOfSight(actor.position, npc.position)
    )
}
