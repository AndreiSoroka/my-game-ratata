import {
    type DeityId,
    type GameEventPayload,
    isItemBroken,
    PRAYER_SCHOOL_DEFINITIONS,
    type PrayerAbilityId,
    prayerAbilityIds,
    profileForPrayer,
    type ProgressionSnapshot,
    type SkillBranch,
    type SkillId,
    skillIds,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import {
    createConstellationState,
    recordConstellationPractice,
    snapshotConstellations,
} from './constellations'
import type { CharacterConstellations } from './constellationState'
import { snapshotDeity, snapshotOtherDeities } from './deities'
import { readCachedConstellationLayout } from './personalConstellationSky'

interface SkillPractice {
    level: number
    practice: number
    unlocked: boolean
}

export interface CharacterProgression {
    constellations: CharacterConstellations
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
    marksmanship: 'Стрельба',
    vitality: 'Жизненный опыт',
    road_faith: 'Вера странника',
    road_miracles: 'Чудеса странника',
    lantern_faith: 'Вера ясности',
    lantern_miracles: 'Чудеса ясности',
    grave_faith: 'Вера праха',
    grave_miracles: 'Чудеса праха',
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
    marksmanship: 10,
    vitality: 10,
    road_faith: 8,
    road_miracles: 8,
    lantern_faith: 8,
    lantern_miracles: 8,
    grave_faith: 8,
    grave_miracles: 8,
}

export function createProgression(): CharacterProgression {
    return {
        constellations: createConstellationState(),
        skills: {
            stealth: { level: 1, practice: 0, unlocked: true },
            theft: { level: 1, practice: 0, unlocked: true },
            swordsmanship: { level: 1, practice: 0, unlocked: true },
            miracles: { level: 1, practice: 0, unlocked: true },
            faith: { level: 1, practice: 0, unlocked: true },
            arcana: { level: 1, practice: 0, unlocked: true },
            fireball: { level: 1, practice: 0, unlocked: false },
            greater_fireball: { level: 1, practice: 0, unlocked: false },
            marksmanship: { level: 1, practice: 0, unlocked: true },
            vitality: { level: 1, practice: 0, unlocked: true },
            road_faith: { level: 1, practice: 0, unlocked: true },
            road_miracles: { level: 1, practice: 0, unlocked: true },
            lantern_faith: { level: 1, practice: 0, unlocked: true },
            lantern_miracles: { level: 1, practice: 0, unlocked: true },
            grave_faith: { level: 1, practice: 0, unlocked: true },
            grave_miracles: { level: 1, practice: 0, unlocked: true },
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

export function canUseResurrection(
    character: GameCharacter,
    abilityId: PrayerAbilityId = 'pray'
): boolean {
    const school = PRAYER_SCHOOL_DEFINITIONS[abilityId]
    return (
        knowsAbility(character, abilityId) &&
        profileForPrayer(abilityId).reviveTypes.length > 0 &&
        (character.heroClass === 'cleric' ||
            character.progression.skills[school.miracleSkillId].level >= 5)
    )
}

export function snapshotProgression(
    character: GameCharacter,
    now: number,
    includePrivate = true
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
        ...(includePrivate
            ? {
                  otherDeities: snapshotOtherDeities(character, now),
                  ...(readCachedConstellationLayout(character) === undefined
                      ? {}
                      : { constellations: snapshotConstellations(character) }),
              }
            : {}),
        magicChaptersRead: character.progression.magicChaptersRead,
        magicChaptersTotal: 3,
        resurrectionUnlocked: canUseResurrection(character),
        resurrectionSchools: prayerAbilityIds.filter((id) =>
            canUseResurrection(character, id)
        ),
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
        !Number.isFinite(amount) ||
        amount < 1
    ) {
        return []
    }
    if (skill.level >= 10) {
        recordConstellationPractice(character, id, 0)
        return []
    }
    const previousLevel = skill.level
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
    recordConstellationPractice(character, id, skill.level - previousLevel)
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
    warfare: ['swordsmanship', 'marksmanship'],
    faith: [
        'faith',
        'miracles',
        'road_faith',
        'road_miracles',
        'lantern_faith',
        'lantern_miracles',
        'grave_faith',
        'grave_miracles',
    ],
    arcana: ['arcana', 'fireball', 'greater_fireball'],
    survival: ['vitality'],
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
        character.trainingTarget === undefined &&
        character.alive &&
        !character.tags.has('offline') &&
        !character.tags.has('state.retired') &&
        character.stunUntil <= now &&
        !character.isActionLocked(now)
    )
}
