import type {
    DeityId,
    GameEventPayload,
    LearnAbilityId,
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
import { canPerformSkillAction, trainSkill } from './skillProgression'

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
        actor.progression.skills.fireball.unlocked ||
        actor.progression.skills.arcana.level < 3
    ) {
        return []
    }
    actor.progression.skills.fireball.unlocked = true
    return [
        {
            actorId: actor.id,
            targetId: scholar.id,
            kind: 'notice',
            text: 'Изучен Огненный шар. Применяйте его в бою, чтобы развивать навык.',
        },
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
    actor.progression.magicChaptersRead += 1
    return [
        {
            actorId: actor.id,
            targetId: scholar.id,
            kind: 'notice',
            text: `Прочитана глава ${String(actor.progression.magicChaptersRead)} из 3. Магические знания укрепились.`,
        },
        ...trainSkill(actor, 'arcana', 8),
        ...finishConstellationAction(actor, { skillIds: ['arcana'], now }),
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
        !actor.progression.skills.fireball.unlocked ||
        student.progression.skills.fireball.unlocked ||
        student.progression.skills.arcana.level < 3
    ) {
        return []
    }
    student.progression.skills.fireball.unlocked = true
    return [
        {
            actorId: actor.id,
            targetId: student.id,
            kind: 'notice',
            text: `${student.nickname} изучает Огненный шар. Учитель и ученик развивают магические знания.`,
        },
        ...trainSkill(actor, 'arcana', 8),
        ...trainSkill(student, 'arcana', 8),
        ...finishConstellationAction(actor, { skillIds: ['arcana'], now }),
        ...finishConstellationAction(student, { skillIds: ['arcana'], now }),
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
    const suitable =
        id === 'pray'
            ? teacher.heroClass === 'cleric' ||
              teacher.tags.has('cleric') ||
              teacher.tags.has('shrine')
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
    syncAbilityConstellations(actor)
    return abilityNotice(
        actor,
        'Способность изучена. Её можно назначить в свободную ячейку 1–4.'
    )
}
