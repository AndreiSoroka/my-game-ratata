import {
    MASTERY_REWARDS,
    type PrayerIntent,
    ROAD_PRAYER_RULES,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { RoadPrayerCastState } from './abilityState'
import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { canPerceivePrayerCaster } from './prayerAuras'
import { consumeResourceRecovery } from './resourcePractice'

function activeSong(source: GameCharacter, now: number, since: number) {
    const cast = source.abilities.casting
    return cast?.mode === 'prayer' &&
        cast.road !== undefined &&
        cast.startedAt <= now &&
        cast.completesAt > since &&
        cast.locationId === source.locationId &&
        source.alive &&
        !source.tags.has('offline') &&
        !source.tags.has('state.retired') &&
        source.stunUntil <= now
        ? { ...cast, road: cast.road }
        : undefined
}

interface RecoverySong {
    source: GameCharacter
    cast: NonNullable<ReturnType<typeof activeSong>>
    durationMs: number
}

function songReaches(
    source: GameCharacter,
    target: GameCharacter,
    radius: number,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        source.locationId === target.locationId &&
        target.alive &&
        target.trainingTarget === undefined &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        !canTargetByFaction(source, target, now) &&
        !canTargetByFaction(target, source, now) &&
        distance(source.position, target.position) <= radius &&
        (source.id === target.id ||
            (canPerceivePrayerCaster(source, target, now) &&
                navigation.hasLineOfSight(source.position, target.position)))
    )
}

export function hasRoadPrayerRecovery(
    target: GameCharacter,
    navigation: NavigationService | undefined,
    now: number
): boolean {
    if (navigation === undefined) {
        return false
    }
    for (const source of target.prayerAuraEnvironment?.characters() ?? [
        target,
    ]) {
        const cast = activeSong(source, now, now)
        if (
            cast !== undefined &&
            songReaches(
                source,
                target,
                cast.road.recoveryRadius,
                navigation,
                now
            )
        ) {
            return true
        }
    }
    return false
}

/** Collect movement's recovery rates only for ticks that can have an active song. */
export function trackRoadPrayerRecovery(characters: Iterable<GameCharacter>) {
    const sources: GameCharacter[] = []
    for (const character of characters) {
        if (character.abilities.casting?.abilityId === 'pray_road') {
            sources.push(character)
        }
    }
    if (sources.length === 0) {
        return undefined
    }
    const energyRates = new Map<GameCharacter, number>()
    return {
        observe: (character: GameCharacter) => (rate: number) => {
            energyRates.set(character, rate)
        },
        apply: (
            navigationFor: (locationId: string) => NavigationService,
            now: number,
            deltaMs: number
        ) =>
            applyRoadPrayerRecovery(
                sources,
                energyRates,
                navigationFor,
                now,
                deltaMs
            ),
    }
}

export function applyRoadPrayerRecovery(
    characters: Iterable<GameCharacter>,
    energyRates: ReadonlyMap<GameCharacter, number>,
    navigationFor: (locationId: string) => NavigationService,
    now: number,
    deltaMs: number
): void {
    const since = now - deltaMs
    const songs = [...characters].flatMap((source) => {
        const cast = activeSong(source, now, since)
        return cast === undefined
            ? []
            : [
                  {
                      source,
                      cast,
                      durationMs:
                          Math.min(now, cast.completesAt) -
                          Math.max(since, cast.startedAt),
                  },
              ]
    })
    if (songs.length === 0) {
        return
    }
    for (const [target, rate] of energyRates) {
        const missing = target.config.resources.maxEnergy - target.energy
        if (missing <= 0 || rate <= 0) {
            continue
        }
        const song = songForRecovery(
            songs,
            target,
            navigationFor(target.locationId),
            now
        )
        if (song === undefined) {
            continue
        }
        const amount = Math.min(
            missing,
            (rate *
                (ROAD_PRAYER_RULES.energyRegenMultiplier - 1) *
                song.durationMs) /
                1000
        )
        song.cast.road.usefulRecovery += consumeResourceRecovery(
            target,
            'energy',
            amount,
            missing
        )
        target.energy += amount
    }
}

function songForRecovery(
    songs: readonly RecoverySong[],
    target: GameCharacter,
    navigation: NavigationService,
    now: number
): RecoverySong | undefined {
    // Overlapping songs give the largest bonus for the tick once.
    let song: RecoverySong | undefined
    for (const candidate of songs) {
        if (
            candidate.durationMs <= 0 ||
            !songReaches(
                candidate.source,
                target,
                candidate.cast.road.recoveryRadius,
                navigation,
                now
            )
        ) {
            continue
        }
        if (candidate.cast.targetId === target.id) {
            candidate.cast.road.restoredTarget = true
        }
        if (candidate.durationMs > (song?.durationMs ?? 0)) {
            song = candidate
        }
    }
    return song
}

export function finishRoadPrayerRecovery(
    road: RoadPrayerCastState | undefined,
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    answered: boolean,
    gaveEnergy: boolean
): number {
    if (road === undefined) {
        return 0
    }
    if (
        road.shoulder &&
        answered &&
        (road.restoredTarget || gaveEnergy) &&
        intent.mode === 'restore'
    ) {
        const target =
            intent.targetId === actor.id
                ? actor
                : context.characters.find(
                      (candidate) => candidate.id === intent.targetId
                  )
        if (target !== undefined) {
            target.movement.roadPrayerDashUntil =
                context.now + ROAD_PRAYER_RULES.dashDiscountDurationMs
        }
    }
    return road.usefulRecovery >= 1 ? MASTERY_REWARDS.resourceRecovery : 0
}
