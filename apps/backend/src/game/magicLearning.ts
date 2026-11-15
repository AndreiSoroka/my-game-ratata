import {
    type ConstellationId,
    type DeityId,
    type GameEventPayload,
    isPrayerAbility,
    type LearnAbilityId,
    MASTERY_REWARDS,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityForDeity,
} from '@my-game-ratata/contracts'

import { type AbilityContext, abilityNotice } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import {
    finishConstellationAction,
    syncAbilityConstellations,
} from './constellations'
import { deityDefinitions } from './deities'
import { distance } from './math'
import {
    awardMasteries,
    canPerformSkillAction,
    captureMasteryFactors,
} from './skillProgression'

export function canInteractWith(
    actor: GameCharacter,
    target: GameCharacter | undefined,
    now: number
): target is GameCharacter {
    return (
        canPerformSkillAction(actor, now) &&
        target !== undefined &&
        target.alive &&
        actor.id !== target.id &&
        !target.tags.has('offline') &&
        target.locationId === actor.locationId &&
        target.faction === actor.faction &&
        distance(actor.position, target.position) <= 64
    )
}

export function learnFireball(
    actor: GameCharacter,
    scholar: GameCharacter | undefined,
    now: number
): GameEventPayload[] {
    if (
        !canInteractWith(actor, scholar, now) ||
        !scholar.tags.has('scholar') ||
        actor.abilities.known.has('fireball') ||
        actor.progression.masteries.magic.level < 3
    ) {
        return []
    }
    const factors = captureMasteryFactors(scholar)
    actor.abilities.known.add('fireball')
    syncAbilityConstellations(actor)
    return [
        {
            actorId: actor.id,
            targetId: scholar.id,
            kind: 'notice',
            text: 'Изучен Огненный шар. Применяйте его в бою, чтобы развивать Магию.',
        },
        ...finishConstellationAction(actor, {
            constellationIds: ['magic'],
            now,
        }),
        ...awardMasteries(
            scholar,
            [
                {
                    constellationId: 'magic',
                    experience: MASTERY_REWARDS.magicTeaching,
                },
            ],
            { now, factors, evidence: ['arcana'] }
        ),
    ]
}

export function studyMagic(
    actor: GameCharacter,
    scholar: GameCharacter | undefined,
    now: number
): GameEventPayload[] {
    if (
        !canInteractWith(actor, scholar, now) ||
        !scholar.tags.has('scholar') ||
        actor.progression.magicChaptersRead >= 3
    ) {
        return []
    }
    const factors = captureMasteryFactors(actor)
    actor.progression.magicChaptersRead += 1
    return [
        {
            actorId: actor.id,
            targetId: scholar.id,
            kind: 'notice',
            text: `Прочитана глава ${String(actor.progression.magicChaptersRead)} из 3. Магические знания укрепились.`,
        },
        ...awardMasteries(
            actor,
            [
                {
                    constellationId: 'magic',
                    experience: MASTERY_REWARDS.magicChapter,
                },
            ],
            { now, factors, evidence: ['arcana'] }
        ),
    ]
}

export function teachMagic(
    actor: GameCharacter,
    student: GameCharacter | undefined,
    now: number
): GameEventPayload[] {
    if (
        !canInteractWith(actor, student, now) ||
        actor.id === student.id ||
        !actor.abilities.known.has('fireball') ||
        student.abilities.known.has('fireball') ||
        student.progression.masteries.magic.level < 3
    ) {
        return []
    }
    const factors = captureMasteryFactors(actor)
    student.abilities.known.add('fireball')
    syncAbilityConstellations(student)
    return [
        {
            actorId: actor.id,
            targetId: student.id,
            kind: 'notice',
            text: `${student.nickname} изучает Огненный шар.`,
        },
        ...finishConstellationAction(student, {
            constellationIds: ['magic'],
            now,
        }),
        ...awardMasteries(
            actor,
            [
                {
                    constellationId: 'magic',
                    experience: MASTERY_REWARDS.magicTeaching,
                },
            ],
            { now, factors, evidence: ['arcana'] }
        ),
    ]
}

export function chooseDeity(
    actor: GameCharacter,
    guide: GameCharacter | undefined,
    deityId: DeityId,
    now: number
): GameEventPayload[] {
    if (!canInteractWith(actor, guide, now)) {
        return []
    }
    if (
        guide.heroClass !== 'cleric' &&
        !guide.tags.has('cleric') &&
        !guide.tags.has('shrine')
    ) {
        return []
    }
    if (!knowsAbility(actor, prayerAbilityForDeity(deityId))) {
        return abilityNotice(actor, 'Сначала изучите молитву этой школы.')
    }
    if (actor.progression.patron === deityId) {
        return []
    }
    actor.progression.patron = deityId
    return [
        {
            actorId: actor.id,
            targetId: guide.id,
            kind: 'notice',
            text: `Ваш покровитель — ${deityDefinitions[deityId].name}. ${deityDefinitions[deityId].domain}.`,
        },
    ]
}

export function learnAbility(
    actor: GameCharacter,
    teacher: GameCharacter | undefined,
    id: LearnAbilityId,
    context: AbilityContext
): GameEventPayload[] {
    if (
        !canInteractWith(actor, teacher, context.now) ||
        !context.navigation.hasLineOfSight(actor.position, teacher.position)
    ) {
        return abilityNotice(
            actor,
            'Подойдите к живому дружественному учителю.'
        )
    }
    if (knowsAbility(actor, id)) {
        return abilityNotice(actor, 'Эта способность уже изучена.')
    }
    const suitable = isPrayerAbility(id)
        ? knowsAbility(teacher, id)
        : id === 'shot'
          ? teacher.tags.has('veteran') || teacher.id === 'npc_veteran_1'
          : teacher.tags.has('scholar')
    if (!suitable) {
        return abilityNotice(
            actor,
            'Этот персонаж не обучает выбранной способности.'
        )
    }
    actor.abilities.known.add(id)
    if (
        isPrayerAbility(id) &&
        !knowsAbility(actor, prayerAbilityForDeity(actor.progression.patron))
    ) {
        actor.progression.patron = PRAYER_SCHOOL_DEFINITIONS[id].deityId
    }
    syncAbilityConstellations(actor)
    const path: ConstellationId = isPrayerAbility(id)
        ? PRAYER_SCHOOL_DEFINITIONS[id].constellationId
        : id === 'shot'
          ? 'arrow'
          : 'magic'
    return [
        ...abilityNotice(
            actor,
            'Способность изучена. Её можно назначить в свободную ячейку 1–4.'
        ),
        ...finishConstellationAction(actor, {
            constellationIds: [path],
            now: context.now,
            random: context.random,
        }),
    ]
}
