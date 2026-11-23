import {
    CENTER_LOCATION_ID,
    type GameEventPayload,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { CrimeEvidence, CrimeOffense } from './crimeEvidence'
import {
    available,
    cityCleric,
    cityGuard,
    humanControlled,
    isCityBlacklisted,
} from './crimeRules'
import { interactionRangeText } from './interactionRangeText'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'
import type { GameRoom } from './room'
import { canPerformSkillAction } from './skillProgression'
import { privateTheftNotice } from './theftEvents'

export interface JusticeContext {
    characters: Iterable<GameCharacter>
    navigation: NavigationService
    now: number
    adventure?: AdventureService
}

export function reportCrime(
    actor: GameCharacter,
    thiefId: string,
    evidence: CrimeEvidence,
    context: JusticeContext,
    offense?: CrimeOffense
): GameEventPayload[] {
    const characters = [...context.characters]
    const thief = characters.find((candidate) => candidate.id === thiefId)
    const proof = evidence.reportable(actor.id, thiefId, context.now, offense)
    const guard = characters.find((candidate) =>
        nearbyReportGuard(actor, candidate, thiefId, context)
    )
    if (
        !canSpeakToOfficial(actor, context.now) ||
        guard === undefined ||
        thief === undefined ||
        thief.tags.has('state.retired') ||
        proof === undefined
    ) {
        return [
            privateTheftNotice(
                actor.id,
                `Для жалобы нужны свежее свидетельство и городской стражник ${interactionRangeText(THEFT_RULES.reportRange, context.navigation.grid.tileWidth)}.`
            ),
        ]
    }
    proof.reported = true
    thief.tags.add('city.blacklisted')
    context.adventure?.refreshTradeAccess(thief)
    return [
        privateTheftNotice(
            actor.id,
            `Жалоба принята: ${thief.nickname} внесён в городскую книгу нарушителей.`
        ),
        privateTheftNotice(
            thief.id,
            'По официальной жалобе ты внесён в чёрный список Новогорода. Стража задерживает силой, торговцы отказывают. Отпущение у Сестры Веры стоит 30 золотых.'
        ),
    ]
}

export function reachableCityGuard(
    actor: GameCharacter,
    accusedId: string,
    context: JusticeContext
): GameCharacter | undefined {
    if (actor.locationId !== CENTER_LOCATION_ID || !actor.soul.canSpeak) {
        return undefined
    }
    return [...context.characters].find(
        (guard) =>
            isReportGuard(actor, guard, accusedId) &&
            (withinOfficialReach(
                actor,
                guard,
                THEFT_RULES.reportRange,
                context
            ) ||
                context.navigation.findPathWorld(
                    actor.position,
                    reportPosition(actor, guard, context)
                ).length > 0)
    )
}

export function isReportGuard(
    actor: GameCharacter,
    guard: GameCharacter | undefined,
    accusedId: string
): guard is GameCharacter {
    return (
        canReceiveReport(guard) &&
        guard.id !== actor.id &&
        guard.id !== accusedId &&
        cityGuard(guard)
    )
}

export function nearbyReportGuard(
    actor: GameCharacter,
    guard: GameCharacter,
    accusedId: string,
    context: JusticeContext
): boolean {
    return (
        isReportGuard(actor, guard, accusedId) &&
        withinOfficialReach(actor, guard, THEFT_RULES.reportRange, context)
    )
}

export function reportPosition(
    actor: GameCharacter,
    guard: GameCharacter,
    context: JusticeContext
) {
    return distance(actor.position, guard.position) <=
        visibilityRadius(
            actor,
            guard,
            THEFT_RULES.guardSightRadius,
            context.now
        ) && context.navigation.hasLineOfSight(actor.position, guard.position)
        ? guard.position
        : guard.spawnPosition
}

export function canReceiveReport(
    guard: GameCharacter | undefined
): guard is GameCharacter {
    return (
        available(guard) &&
        !humanControlled(guard) &&
        guard.soul.canSpeak &&
        guard.locationId === CENTER_LOCATION_ID
    )
}

export function absolve(
    actor: GameCharacter,
    clericId: string,
    context: JusticeContext,
    clear: () => void
): GameEventPayload[] {
    const cleric = [...context.characters].find(
        (candidate) => candidate.id === clericId && cityCleric(candidate)
    )
    if (
        !canSpeakToOfficial(actor, context.now) ||
        cleric === undefined ||
        !nearbyOfficial(actor, cleric, THEFT_RULES.absolutionRange, context)
    ) {
        return [
            privateTheftNotice(
                actor.id,
                `Чтобы попросить отпущения, нужен живой городской клирик ${interactionRangeText(THEFT_RULES.absolutionRange, context.navigation.grid.tileWidth)}.`
            ),
        ]
    }
    if (!isCityBlacklisted(actor)) {
        return [
            privateTheftNotice(
                actor.id,
                'В городской книге нет записи о твоих проступках.'
            ),
        ]
    }
    if (
        context.adventure?.trySpendGold(
            actor.id,
            THEFT_RULES.absolutionGold
        ) !== true
    ) {
        return [
            privateTheftNotice(
                actor.id,
                'Отпущение стоит 30 золотых. Недостаточно средств.'
            ),
        ]
    }
    clear()
    context.adventure.refreshTradeAccess(actor)
    return [
        privateTheftNotice(
            actor.id,
            'Ты заплатил 30 золотых. Грехи отпущены, запись и прежние обвинения сняты. Торговля снова открыта.'
        ),
    ]
}

export function visibleCityCriminal(
    guard: GameCharacter,
    characters: Iterable<GameCharacter>,
    room: GameRoom,
    now: number
): GameCharacter | undefined {
    if (
        !available(guard) ||
        !cityGuard(guard) ||
        humanControlled(guard) ||
        guard.locationId !== CENTER_LOCATION_ID
    ) {
        return undefined
    }
    const navigation = room.navigationFor(guard)
    return [...characters]
        .filter(
            (target) =>
                target.id !== guard.id &&
                available(target) &&
                isCityBlacklisted(target) &&
                target.locationId === CENTER_LOCATION_ID &&
                distance(guard.position, target.position) <=
                    visibilityRadius(
                        guard,
                        target,
                        THEFT_RULES.guardSightRadius,
                        now
                    ) &&
                navigation.hasLineOfSight(guard.position, target.position)
        )
        .sort(
            (first, second) =>
                distance(guard.position, first.position) -
                distance(guard.position, second.position)
        )[0]
}

function canSpeakToOfficial(actor: GameCharacter, now: number): boolean {
    return (
        canPerformSkillAction(actor, now) &&
        actor.soul.canSpeak &&
        actor.locationId === CENTER_LOCATION_ID
    )
}

function nearbyOfficial(
    actor: GameCharacter,
    official: GameCharacter,
    range: number,
    context: JusticeContext
): boolean {
    return (
        official.id !== actor.id &&
        canReceiveReport(official) &&
        withinOfficialReach(actor, official, range, context)
    )
}

function withinOfficialReach(
    actor: GameCharacter,
    official: GameCharacter,
    range: number,
    context: JusticeContext
): boolean {
    return (
        distance(actor.position, official.position) <= range &&
        context.navigation.hasLineOfSight(actor.position, official.position)
    )
}
