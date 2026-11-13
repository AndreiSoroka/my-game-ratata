import type { DeityId, GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
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
        actor.progression.skills.fireball.unlocked
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
        student.progression.skills.fireball.unlocked
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
