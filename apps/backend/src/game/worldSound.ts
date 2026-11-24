import {
    type GameEventPayload,
    interactionApproachPoints,
    type Vector2,
    WORLD_SOUND_RADII,
    type WorldAudioCue,
    type WorldObjectBounds,
    type WorldSoundEffect,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canObserveRoomCharacter } from './characterSight'
import type { CombatObserver } from './combatObservation'
import { distance } from './math'

interface SoundSource {
    sourceActorId?: string
    sourceBounds?: WorldObjectBounds
}

interface WorldSound {
    cue: WorldAudioCue
    source: SoundSource
}

// Domain events remain usable by simulation and AI without carrying wire-only audio.
const sounds = new WeakMap<GameEventPayload, WorldSound>()
let sequence = 0

export function withWorldSound<Event extends GameEventPayload>(
    event: Event,
    effect: WorldSoundEffect,
    locationId: string,
    position: Vector2,
    source: SoundSource = {}
): Event {
    sounds.set(event, {
        cue: {
            id: `world-sound:${String(++sequence)}`,
            effect,
            locationId,
            position: { ...position },
        },
        source: {
            ...source,
            ...(source.sourceBounds === undefined
                ? {}
                : { sourceBounds: { ...source.sourceBounds } }),
        },
    })
    return event
}

export function projectWorldSound(
    event: GameEventPayload,
    view: CombatObserver
): WorldAudioCue | undefined {
    const sound = sounds.get(event)
    const listener = view.observer
    if (sound === undefined || !activeSoundListener(listener)) {
        return undefined
    }
    const { cue, source } = sound
    if (
        event.audienceIds?.includes(listener.id) === false ||
        listener.locationId !== cue.locationId ||
        distance(listener.position, cue.position) >=
            WORLD_SOUND_RADII[cue.effect] ||
        !sourceActorVisible(
            source.sourceActorId,
            cue.locationId,
            listener,
            view
        )
    ) {
        return undefined
    }
    const endpoint = acousticEndpoint(listener.position, cue, source)
    return view.navigation?.hasLineOfSight(listener.position, endpoint) ===
        false
        ? { ...cue, obstructed: true }
        : cue
}

function activeSoundListener(
    listener: GameCharacter | undefined
): listener is GameCharacter {
    return (
        listener?.alive === true &&
        listener.connected &&
        !listener.tags.has('offline') &&
        !listener.tags.has('state.retired')
    )
}

function sourceActorVisible(
    id: string | undefined,
    locationId: string,
    listener: GameCharacter,
    view: CombatObserver
): boolean {
    if (id === undefined || id === listener.id) {
        return true
    }
    const actor = view.getCharacter(id)
    return (
        actor?.locationId === locationId &&
        canObserveRoomCharacter(listener, actor, view.navigation, view.now)
    )
}

function acousticEndpoint(
    listener: Vector2,
    cue: WorldAudioCue,
    { sourceBounds }: SoundSource
): Vector2 {
    if (sourceBounds === undefined) {
        return cue.position
    }
    const { x, y, width, height } = sourceBounds
    if (
        listener.x >= x &&
        listener.x < x + width &&
        listener.y >= y &&
        listener.y < y + height
    ) {
        return listener
    }
    return (
        interactionApproachPoints(listener, [sourceBounds])[0] ?? cue.position
    )
}
