import {
    CENTER_LOCATION_ID,
    type GameEventPayload,
    THEFT_RULES,
} from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { CrimeEvidence } from './crimeEvidence'
import {
    available,
    cityCleric,
    cityGuard,
    humanControlled,
    isCityBlacklisted,
} from './crimeRules'
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

export function reportTheft(
    actor: GameCharacter,
    thiefId: string,
    evidence: CrimeEvidence,
    context: JusticeContext
): GameEventPayload[] {
    const characters = [...context.characters]
    const thief = characters.find((candidate) => candidate.id === thiefId)
    const proof = evidence.get(actor.id, thiefId)
    const guard = characters.find(
        (candidate) =>
            candidate.id !== thiefId &&
            cityGuard(candidate) &&
            nearbyOfficial(actor, candidate, THEFT_RULES.reportRange, context)
    )
    if (
        !canSpeakToOfficial(actor, context.now) ||
        guard === undefined ||
        thief === undefined ||
        thief.tags.has('state.retired') ||
        proof === undefined ||
        proof.reported ||
        proof.expiresAt <= context.now
    ) {
        return [
            privateTheftNotice(
                actor.id,
                'Для жалобы нужны свежее свидетельство и городской стражник в пределах 64 шагов.'
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
                'Подойди к живому городскому клирику в пределах 64 шагов, чтобы попросить отпущения.'
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
        available(official) &&
        !humanControlled(official) &&
        official.soul.canSpeak &&
        official.locationId === CENTER_LOCATION_ID &&
        distance(actor.position, official.position) <= range &&
        context.navigation.hasLineOfSight(actor.position, official.position)
    )
}
