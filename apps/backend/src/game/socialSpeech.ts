import { PUBLIC_SPEECH_RADIUS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { visibleBuildingPoint } from './mapBuildings'
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
    radius = PUBLIC_SPEECH_RADIUS
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

export function canConverseWithNpc(
    first: GameCharacter,
    second: GameCharacter,
    navigation: NavigationService,
    now: number,
    radius: number
): boolean {
    const buildings = navigation.grid.buildings ?? []
    return (
        canHearSpeech(first, second, navigation, now, radius) &&
        canHearSpeech(second, first, navigation, now, radius) &&
        visibleBuildingPoint(buildings, first.position, second.position) &&
        visibleBuildingPoint(buildings, second.position, first.position)
    )
}
