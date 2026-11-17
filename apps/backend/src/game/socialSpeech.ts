import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'

export function speechAvailable(actor: GameCharacter): boolean {
    return (
        actor.alive &&
        !actor.tags.has('offline') &&
        !actor.tags.has('state.retired') &&
        (actor.controllerKind !== 'network_player' || actor.connected)
    )
}

export function canHearSpeech(
    listener: GameCharacter,
    speaker: GameCharacter,
    navigation: NavigationService,
    now: number,
    radius = 80
): boolean {
    return (
        listener.id !== speaker.id &&
        speechAvailable(listener) &&
        speechAvailable(speaker) &&
        speaker.soul.canSpeak &&
        listener.locationId === speaker.locationId &&
        distance(listener.position, speaker.position) <=
            visibilityRadius(listener, speaker, radius, now) &&
        navigation.hasLineOfSight(listener.position, speaker.position)
    )
}
