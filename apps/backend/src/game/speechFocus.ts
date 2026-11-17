import type { SpeechFocus } from '@my-game-ratata/contracts'

import { buildNpcAiObservation } from '../ai/observation'
import type { GameCharacter } from './character'
import type { GameRoom } from './room'

/** A selection is a hint, never a source of client-authored names or hidden contents. */
export function projectSpeechFocus(
    room: GameRoom,
    speaker: GameCharacter,
    key: string | undefined,
    now: number
): SpeechFocus | undefined {
    if (key === undefined) {
        return undefined
    }
    const target = buildNpcAiObservation(
        room,
        speaker,
        'companion',
        now
    ).targets.find((entry) => entry.key === key)
    return target === undefined
        ? undefined
        : {
              key: target.key,
              id: target.id,
              kind: target.kind,
              name: target.name,
              position: { ...target.position },
              details: structuredClone(target.details),
          }
}
