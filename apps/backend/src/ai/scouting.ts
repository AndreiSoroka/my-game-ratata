import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { buildNpcAiObservation } from './observation'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiFact } from './types'

/** A movement receipt earns a fresh, bounded view, not a map-wide presence check. */
export function rememberNpcScouting(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    receiptId: string,
    now: number
): void {
    if (state.task?.requesterId == null) {
        return
    }
    const observation = buildNpcAiObservation(
        room,
        actor,
        state.config.role,
        now
    )
    const fact: Extract<NpcAiFact, { kind: 'scouting' }> = {
        kind: 'scouting',
        locationId: actor.locationId,
        position: { ...actor.position },
        observedAt: now,
        scope: 'visible_only',
        visible: observation.targets
            .filter((target) => target.kind !== 'building')
            .slice(0, 32)
            .map(({ id, name, kind, position }) => ({
                id,
                name,
                kind,
                position: { ...position },
            })),
    }
    state.facts = [...state.facts, fact].slice(-4)
    state.mind.remember({
        id: `scouting:${receiptId}`,
        senderId: actor.id,
        senderName: actor.nickname,
        recipientId: state.task.requesterId,
        source: 'seen',
        channel: 'whisper',
        at: now,
        locationId: actor.locationId,
        text: `Осмотр места после прибытия: ${observation.locationName}. Увидел: ${fact.visible.length > 0 ? fact.visible.map((entry) => entry.name).join(', ') : 'никого из различимых целей'}. Это только видимое с этой точки в тот момент, не сведения обо всей местности.`,
    })
}
