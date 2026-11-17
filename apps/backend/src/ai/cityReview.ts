import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { buildNpcAiObservation } from './observation'
import { enqueueNpcAiEvent, type NpcAiActorState } from './runtimeState'

export function reviewNpcAiCity(
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    room: GameRoom,
    intervalMs: number,
    nextId: (kind: string) => string
): void {
    state.inspectAt = now + 1_000
    if (state.awaitingFreshRequest) {
        return
    }
    const fingerprint = npcAiCityFingerprint(
        buildNpcAiObservation(room, actor, state.config.role, now).city
    )
    const changed =
        state.cityFingerprint !== undefined &&
        state.cityFingerprint !== fingerprint
    state.cityFingerprint = fingerprint
    if ((!changed && now < state.reviewAt) || state.task !== null) {
        return
    }
    state.reviewAt = now + intervalMs
    state.memory = state.conversations.get('city') ?? ''
    state.task = {
        id: nextId('city'),
        requesterId: null,
        request:
            'Разовый городской обзор: оцени реальные нужды и выбери полезный следующий шаг. Предлагай существующие обращения или проверяемые задания живым игрокам, а не работникам. Не создавай ресурсы или награды. Учитывай уже полученные сведения осмотра; не осматривай одного работника повторно без изменений. Закончи обзор, если сейчас больше нечего сделать.',
        steps: 0,
    }
    enqueueNpcAiEvent(state, {
        kind: 'world',
        id: nextId('world'),
        reason: changed ? 'city_changed' : 'city_review',
        at: now,
    })
}

export function npcAiCityFingerprint(city: unknown): string {
    return JSON.stringify({ city }, (key, value: unknown) =>
        key === 'observedAt' || key === 'since' ? undefined : value
    )
}
