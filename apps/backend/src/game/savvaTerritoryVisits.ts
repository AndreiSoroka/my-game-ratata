import type { GameLocale, Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { visibleBuildingPoint } from './mapBuildings'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { grantPersonalHostility, isLivingHuman } from './personalHostility'
import { visibilityRadius } from './queries'
import type { GameRoom } from './room'
import { canHearNearbySpeech } from './socialSpeech'
import { createSpeechEvent } from './speechReceipts'

export const savvaEntryTiles = 5
export const savvaMaxWarningViolations = 3
export const savvaTrespassCause = 'savva_refuge'
const innerTiles = 2
const dwellMs = 3_000
const personalHostilityMs = 30_000
const warning: Record<GameLocale, string> = {
    ru: 'Стой. Не подходи ближе к моему убежищу.',
    en: 'Stop. Stay back from my refuge.',
}

interface Visit {
    deathSequence: number
    inside: boolean
    insideSince: number | undefined
    counted: boolean
}

export interface SavvaVisits {
    home: Vector2
    visits: Map<GameCharacter, Visit>
    violations: number
}

export function advanceSavvaVisits(
    savva: GameCharacter,
    state: SavvaVisits,
    room: GameRoom,
    neighbors: readonly GameCharacter[],
    navigation: NavigationService,
    now: number
): void {
    for (const visitor of state.visits.keys()) {
        if (
            room.getCharacter(visitor.id) !== visitor ||
            visitor.locationId !== savva.locationId ||
            !withinSavvaTerritory(
                state.home,
                visitor,
                navigation,
                savvaEntryTiles
            )
        ) {
            state.visits.delete(visitor)
        }
    }
    for (const visitor of neighbors) {
        if (
            visitor !== savva &&
            isLivingHuman(visitor) &&
            withinSavvaTerritory(
                state.home,
                visitor,
                navigation,
                savvaEntryTiles
            )
        ) {
            observeVisit(savva, visitor, state, room, navigation, now)
            if (state.violations === savvaMaxWarningViolations) {
                return
            }
        }
    }
}

function observeVisit(
    savva: GameCharacter,
    visitor: GameCharacter,
    state: SavvaVisits,
    room: GameRoom,
    navigation: NavigationService,
    now: number
): void {
    const visit = state.visits.get(visitor)
    if (visit?.counted === true) {
        return
    }
    const inside = withinSavvaTerritory(
        state.home,
        visitor,
        navigation,
        innerTiles
    )
    const visible = canSeeSavvaVisitor(savva, visitor, navigation, now)
    if (visit?.deathSequence !== visitor.deathSequence) {
        if (visible && canHearNearbySpeech(visitor, savva, navigation, now)) {
            state.visits.set(visitor, {
                deathSequence: visitor.deathSequence,
                inside,
                insideSince: inside ? now : undefined,
                counted: false,
            })
            warnVisitor(room, savva, visitor)
        }
        return
    }
    if (!ignoresWarning(visit, inside, visible, now)) {
        return
    }
    visit.counted = true
    state.violations += 1
    grantPersonalHostility(
        savva,
        visitor,
        savvaTrespassCause,
        now + personalHostilityMs
    )
}

function ignoresWarning(
    visit: Visit,
    inside: boolean,
    visible: boolean,
    now: number
): boolean {
    const entered = inside && !visit.inside
    visit.inside = inside
    visit.insideSince =
        visible && inside ? (visit.insideSince ?? now) : undefined
    return (
        visit.insideSince !== undefined &&
        (entered || now - visit.insideSince >= dwellMs)
    )
}

function warnVisitor(
    room: GameRoom,
    savva: GameCharacter,
    visitor: GameCharacter
): void {
    const language = room.localeFor(visitor.id)
    room.publishEvents([
        {
            ...createSpeechEvent(savva, warning[language], {
                targetId: visitor.id,
                audienceIds: [visitor.id],
            }),
            channel: 'say',
            language,
        },
    ])
}

export function canSeeSavvaVisitor(
    savva: GameCharacter,
    visitor: GameCharacter,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        visitor.alive &&
        !visitor.tags.has('offline') &&
        !visitor.tags.has('state.retired') &&
        visitor.locationId === savva.locationId &&
        distance(savva.position, visitor.position) <=
            visibilityRadius(savva, visitor, 128, now) &&
        navigation.hasLineOfSight(savva.position, visitor.position) &&
        visibleBuildingPoint(
            navigation.grid.buildings ?? [],
            savva.position,
            visitor.position
        )
    )
}

export function withinSavvaTerritory(
    home: Vector2,
    visitor: GameCharacter,
    navigation: NavigationService,
    tiles: number
): boolean {
    return distance(home, visitor.position) <= navigation.grid.tileWidth * tiles
}
