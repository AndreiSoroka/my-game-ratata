import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { canConverseWithNpc } from './socialSpeech'

export const CONVERSATION_REACH = 48

type CanReadQuestBoard = (
    actor: GameCharacter,
    objectId: string,
    navigation: NavigationService
) => boolean

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
    urgentThreat: (npc: GameCharacter) => boolean = () => false,
    canReadQuestBoard?: CanReadQuestBoard,
    now = 0
): Set<string> {
    const actors = new Map([...characters].map((actor) => [actor.id, actor]))
    const held = new Set<string>()
    for (const [actorId, state] of states) {
        const dialogue = state.dialogue
        if (dialogue === null || dialogue.kind === 'sign') {
            continue
        }
        const actor = actors.get(actorId)
        if (dialogue.kind === 'quest_board') {
            reconcileQuestBoard(
                state,
                actor,
                dialogue.npcId,
                navigationFor,
                canReadQuestBoard
            )
            continue
        }
        const npc = actors.get(dialogue.npcId)
        if (actor?.controllerKind !== 'network_player') {
            state.dialogue = null
            continue
        }
        if (
            !conversationAvailable(
                actor,
                npc,
                navigationFor,
                now,
                dialogue.initialView === undefined
            ) ||
            urgentThreat(npc)
        ) {
            state.dialogue = null
            continue
        }
        if (dialogue.initialView === undefined) {
            continue
        }
        holdForConversation(actor, npc, held)
    }
    return held
}

function reconcileQuestBoard(
    state: PlayerAdventure,
    actor: GameCharacter | undefined,
    objectId: string,
    navigationFor: (actor: GameCharacter) => NavigationService,
    canReadQuestBoard?: CanReadQuestBoard
): void {
    if (
        actor === undefined ||
        canReadQuestBoard?.(actor, objectId, navigationFor(actor)) !== true
    ) {
        state.dialogue = null
    }
}

function holdForConversation(
    actor: GameCharacter,
    npc: GameCharacter,
    held: Set<string>
): void {
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

function available(actor: GameCharacter | undefined): actor is GameCharacter {
    return (
        actor !== undefined &&
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired')
    )
}

function conversationAvailable(
    actor: GameCharacter,
    npc: GameCharacter | undefined,
    navigationFor: (actor: GameCharacter) => NavigationService,
    now: number,
    allowSpeechAcrossFurniture: boolean
): npc is GameCharacter {
    const navigation = navigationFor(actor)
    return (
        available(actor) &&
        available(npc) &&
        actor.connected &&
        actor.locationId === npc.locationId &&
        distance(actor.position, npc.position) <= CONVERSATION_REACH &&
        (navigation.hasLineOfSight(actor.position, npc.position) ||
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
