import type { GameRoom } from '../game/room'
import { rememberVisiblePeople } from './memoryObservation'
import { markNpcGreetingAttempt, selectNpcGreeting } from './npcInitiative'
import type { NpcAiObservation } from './observationTypes'
import type { NpcAiActorState } from './runtimeState'

export function rememberAndGreet(
    room: GameRoom,
    state: NpcAiActorState,
    observation: NpcAiObservation,
    now: number,
    enabled: boolean,
    nextId: (kind: string) => string
): void {
    rememberVisiblePeople(
        state,
        observation.targets,
        observation.locationId,
        now
    )
    if (!enabled || state.nextAt > now) {
        return
    }
    const greeting = selectNpcGreeting(room, state, observation, now)
    if (greeting === undefined) {
        return
    }
    markNpcGreetingAttempt(state, greeting.targetId, now)
    state.memory = state.conversations.get(`say:${greeting.targetId}`) ?? ''
    state.task = {
        id: nextId('greeting'),
        requesterId: null,
        background: 'greeting',
        targetId: greeting.targetId,
        request:
            'Коротко поприветствуй видимого собеседника с учётом текущего контекста и памяти. При необходимости назови имя и краткую роль, но не пересказывай предысторию или список обязанностей без вопроса. Не принимай поручение от его имени.',
        steps: 0,
    }
    state.events.push({
        kind: 'world',
        id: nextId('encounter'),
        reason: greeting.reason,
        at: now,
    })
    state.awaitingFreshRequest = false
}
