import {
    type DeityId,
    type GameEventPayload,
    isItemBroken,
    type ProgressionSnapshot,
    type SkillBranch,
    type SkillId,
    skillIds,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { snapshotDeity } from './deities'

interface SkillPractice {
    level: number
    practice: number
    unlocked: boolean
}

export interface CharacterProgression {
    skills: Record<SkillId, SkillPractice>
    patron: DeityId
    magicChaptersRead: number
    prayerAvailableAt: number
    spellAvailableAt: number
}

const skillNames: Record<SkillId, string> = {
    stealth: 'Скрытность',
    theft: 'Воровство',
    swordsmanship: 'Владение мечом',
    miracles: 'Чудеса',
    faith: 'Вера',
    arcana: 'Магические знания',
    fireball: 'Огненный шар',
    greater_fireball: 'Большой огненный шар',
}
const practiceBase: Record<SkillId, number> = {
    stealth: 10,
    theft: 8,
    swordsmanship: 12,
    miracles: 8,
    faith: 8,
    arcana: 8,
    fireball: 10,
    greater_fireball: 14,
}

export function createProgression(): CharacterProgression {
    return {
        skills: {
            stealth: { level: 1, practice: 0, unlocked: true },
            theft: { level: 1, practice: 0, unlocked: true },
            swordsmanship: { level: 1, practice: 0, unlocked: true },
            miracles: { level: 1, practice: 0, unlocked: true },
            faith: { level: 1, practice: 0, unlocked: true },
            arcana: { level: 1, practice: 0, unlocked: true },
            fireball: { level: 1, practice: 0, unlocked: false },
            greater_fireball: { level: 1, practice: 0, unlocked: false },
        },
        patron: 'hearth',
        magicChaptersRead: 0,
        prayerAvailableAt: 0,
        spellAvailableAt: 0,
    }
}

export function earnedSkillLevels(progression: CharacterProgression): number {
    return skillIds.reduce(
        (sum, id) => sum + progression.skills[id].level - 1,
        0
    )
}

export function practiceThreshold(
    progression: CharacterProgression,
    id: SkillId
): number {
    const level = progression.skills[id].level
    return level >= 10
        ? 0
        : Math.ceil(practiceBase[id] * level * trainingMultiplier(progression))
}

export function canUseResurrection(character: GameCharacter): boolean {
    return (
        knowsAbility(character, 'pray') &&
        (character.progression.patron === 'hearth' ||
            character.progression.patron === 'grave') &&
        (character.heroClass === 'cleric' ||
            character.progression.skills.miracles.level >= 5)
    )
}

export function snapshotProgression(
    character: GameCharacter,
    now: number
): ProgressionSnapshot {
    const totalEarnedLevels = earnedSkillLevels(character.progression)
    return {
        skills: skillIds.map((id) => ({
            id,
            name: skillNames[id],
            ...character.progression.skills[id],
            practiceToNext: practiceThreshold(character.progression, id),
        })),
        totalEarnedLevels,
        trainingMultiplier: trainingMultiplier(character.progression),
        practicedBranches: practicedBranches(character.progression),
        deity: snapshotDeity(character, now),
        magicChaptersRead: character.progression.magicChaptersRead,
        magicChaptersTotal: 3,
        resurrectionUnlocked: canUseResurrection(character),
    }
}

export function trainSkill(
    character: GameCharacter,
    id: SkillId,
    amount = 1
): GameEventPayload[] {
    const skill = character.progression.skills[id]
    if (
        !character.alive ||
        !skill.unlocked ||
        skill.level >= 10 ||
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return []
    }
    skill.practice += Math.floor(amount)
    const events: GameEventPayload[] = []
    while (
        skill.level < 10 &&
        skill.practice >= practiceThreshold(character.progression, id)
    ) {
        skill.practice -= practiceThreshold(character.progression, id)
        skill.level += 1
        events.push({
            actorId: character.id,
            kind: 'skill_up',
            amount: skill.level,
            text: `${skillNames[id]}: уровень ${String(skill.level)}`,
        })
    }
    if (skill.level === 10) {
        skill.practice = 0
    }
    if (character.progression.skills.fireball.level === 10) {
        character.progression.skills.greater_fireball.unlocked = true
    }
    return events
}

export function hasEquippedSword(character: GameCharacter): boolean {
    const weapon = character.equipment.weapon
    return (
        weapon !== undefined &&
        !isItemBroken(weapon) &&
        (weapon.itemId === 'simple_sword' || weapon.itemId === 'old_sword')
    )
}

const branches: Record<SkillBranch, SkillId[]> = {
    cunning: ['stealth', 'theft'],
    warfare: ['swordsmanship'],
    faith: ['faith', 'miracles'],
    arcana: ['arcana', 'fireball', 'greater_fireball'],
}

export function practicedBranches(
    progression: CharacterProgression
): SkillBranch[] {
    return (Object.keys(branches) as SkillBranch[]).filter((branch) =>
        branches[branch].some(
            (id) =>
                progression.skills[id].level > 1 ||
                progression.skills[id].practice > 0
        )
    )
}

export function trainingMultiplier(progression: CharacterProgression): number {
    const extraBranches = Math.max(0, practicedBranches(progression).length - 1)
    return 1 + earnedSkillLevels(progression) / 10 + extraBranches * 0.25
}

export function canPerformSkillAction(
    character: GameCharacter,
    now: number
): boolean {
    return (
        character.alive &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired') &&
        character.stunUntil <= now &&
        !character.isActionLocked(now)
    )
}
