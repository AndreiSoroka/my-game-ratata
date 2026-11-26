import { type ConstellationId, constellationIds } from './development'

export const MASTERY_XP_SCALE = 1_000_000n
export type MasteryLevels = Readonly<Record<ConstellationId, number>>

export interface MasterySnapshot {
    id: ConstellationId
    name: string
    level: number
    /** Human XP as exact decimal strings, never JSON BigInts or rounded Numbers. */
    experience: string
    experienceToNext: string
    totalExperience: string
    pendingOpenings: number
    conflictMultiplier: number
}

export const MASTERY_NAMES: Readonly<Record<ConstellationId, string>> =
    Object.freeze({
        blade: 'Клинок',
        magic: 'Магия',
        prayer: 'Угольная Мать',
        arrow: 'Стрела',
        life: 'Жизнь',
        shadow: 'Скрытность',
        theft: 'Воровство',
        prayer_road: 'Путь странника',
        prayer_lantern: 'Ясность',
        prayer_grave: 'Прах',
        undead: 'Нежить',
        fat_zombie: 'Тяжёлая плоть',
        artisan: 'Ремесленник',
    })

export const MASTERY_REWARDS = Object.freeze({
    healing: 30,
    resourceRecovery: 30,
    prayerHarm: 70,
    graveStep: 10,
    graveFinal: 150,
    resurrection: 200,
    ashRaise: 70,
    ashBrand: 40,
    swordHit: 15,
    shotHit: 20,
    sparkHit: 25,
    fireballHit: 40,
    greaterFireballHit: 70,
    barrierAbsorb: 20,
    chainsBlock: 25,
    dispelEnemy: 25,
    vitalityBlock: 20,
    vitalityWorkBlock: 10,
    stealthMove: 15,
    theftSuccess: 70,
    theftQuietPractice: 25,
    magicChapter: 50,
    magicTeaching: 50,
    woodHarvest: 25,
})
export type MasteryRewardId = keyof typeof MASTERY_REWARDS

const rewardLabels: Record<MasteryRewardId, string> = {
    healing: 'Лечение одного получателя',
    resourceRecovery: 'Полезное восстановление ресурса одному получателю',
    prayerHarm: 'Полезный урон Кары одному противнику',
    graveStep: 'Успешный шаг очищения могилы',
    graveFinal: 'Последний очищающий шаг',
    resurrection: 'Воскрешение товарища',
    ashRaise: 'Подъём одного прислужника из останков',
    ashBrand: 'Полезный урон Пепельной печати',
    swordHit: 'Полезный удар клинком',
    shotHit: 'Полезное попадание стрелой',
    sparkHit: 'Полезное попадание Искрой',
    fireballHit: 'Полезное попадание Огненной стрелой',
    greaterFireballHit: 'Полезное попадание Большим огненным шаром',
    barrierAbsorb: 'Первое полезное поглощение Барьером за применение',
    chainsBlock: 'Первая остановка движения противника за применение Оков',
    dispelEnemy: 'Снятие вражеского магического эффекта за одно Рассеивание',
    vitalityBlock: 'Учтённые 20% HP вражеских ран или их восстановления',
    vitalityWorkBlock:
        'Восстановление 20% базового запаса сил после полезной работы',
    stealthMove: 'Учтённое скрытное перемещение',
    theftSuccess: 'Успешная кража предмета',
    theftQuietPractice: 'Учтённая незамеченная попытка у NPC',
    magicChapter: 'Изучение новой главы',
    magicTeaching: 'Обучение другого новому заклинанию',
    woodHarvest: 'Добытое бревно после открытия Ремесленника',
}
const pathRewards: Record<ConstellationId, readonly MasteryRewardId[]> = {
    blade: ['swordHit'],
    magic: [
        'sparkHit',
        'fireballHit',
        'greaterFireballHit',
        'barrierAbsorb',
        'chainsBlock',
        'dispelEnemy',
        'magicChapter',
        'magicTeaching',
    ],
    prayer: [
        'healing',
        'prayerHarm',
        'graveStep',
        'graveFinal',
        'resurrection',
    ],
    arrow: ['shotHit'],
    life: ['vitalityBlock', 'vitalityWorkBlock'],
    shadow: ['stealthMove'],
    theft: ['theftSuccess', 'theftQuietPractice'],
    prayer_road: ['resourceRecovery'],
    prayer_lantern: ['resourceRecovery'],
    prayer_grave: ['healing', 'resurrection', 'ashRaise', 'ashBrand'],
    undead: [],
    fat_zombie: [],
    artisan: ['woodHarvest'],
}
export function masteryRewardsForConstellation(id: ConstellationId) {
    return pathRewards[id].map((reward) => ({
        id: reward,
        label: rewardLabels[reward],
        experience: MASTERY_REWARDS[reward],
    }))
}

export function createMasteryLevels(): Record<ConstellationId, number> {
    return Object.fromEntries(constellationIds.map((id) => [id, 0])) as Record<
        ConstellationId,
        number
    >
}

function validateLevel(level: number): void {
    if (!Number.isSafeInteger(level) || level < 0) {
        throw new RangeError('Mastery level must be a nonnegative safe integer')
    }
}
function fibonacci(index: number): bigint {
    let a = 0n,
        b = 1n
    for (const bit of index.toString(2)) {
        const c = a * (2n * b - a),
            d = a * a + b * b
        if (bit === '0') {
            a = c
            b = d
        } else {
            a = d
            b = c + d
        }
    }
    return a
}

/** Integer Newton iteration returns the square root rounded down. */
function floorSquareRoot(value: bigint): bigint {
    if (value < 2n) {
        return value
    }
    const bitLength = BigInt(value.toString(2).length)
    let root = 1n << ((bitLength + 1n) / 2n)
    let next = (root + value / root) / 2n
    while (next < root) {
        root = next
        next = (root + value / root) / 2n
    }
    return root
}

/** min(100 F_(L+1), 100 (L+1)^1.5), rounded down to micro-XP. */
export function masteryThreshold(level: number): bigint {
    validateLevel(level)
    const base = 100n * MASTERY_XP_SCALE
    // Fibonacci is cheaper through level 8 (2100 XP); the power stays cheaper after it.
    if (level < 8) {
        return base * fibonacci(level + 1)
    }
    const nextLevel = BigInt(level) + 1n
    return floorSquareRoot(base * base * nextLevel ** 3n)
}

const cumulativeMasteryExperience: bigint[] = [0n]

/** Total XP needed to reach the given level from zero. */
export function masteryTotalExperience(level: number): bigint {
    validateLevel(level)
    const cached = cumulativeMasteryExperience[level]
    if (cached !== undefined) {
        return cached
    }
    let total =
        cumulativeMasteryExperience[cumulativeMasteryExperience.length - 1] ??
        0n
    while (cumulativeMasteryExperience.length <= level) {
        const previous = cumulativeMasteryExperience.length - 1
        total += masteryThreshold(previous)
        cumulativeMasteryExperience.push(total)
    }
    return total
}
export function formatMasteryExperience(micros: bigint): string {
    if (micros < 0n) {
        throw new RangeError('Mastery experience cannot be negative')
    }
    const whole = micros / MASTERY_XP_SCALE
    const fraction = (micros % MASTERY_XP_SCALE)
        .toString()
        .padStart(6, '0')
        .replace(/0+$/, '')
    return fraction.length > 0 ? `${String(whole)}.${fraction}` : String(whole)
}
export function parseMasteryExperience(value: string): bigint {
    if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
        throw new RangeError('Invalid mastery experience')
    }
    const [whole, fraction = ''] = value.split('.')
    return (
        BigInt(whole ?? '0') * MASTERY_XP_SCALE +
        BigInt(fraction.padEnd(6, '0'))
    )
}
export function masteryConflict(
    levels: MasteryLevels,
    id: ConstellationId
): number {
    let total = 0,
        lag = 0
    const own = levels[id]
    validateLevel(own)
    for (const path of constellationIds) {
        const level = levels[path]
        validateLevel(level)
        total += level
        if (path !== id) {
            lag += Math.max(0, level - own)
        }
    }
    return (
        ((own + 2) / (total + 2)) ** (2 / 3) *
        Math.sqrt((own + 2) / (own + 2 + lag))
    )
}
export function masteryRewardMicros(base: number, multiplier: number): bigint {
    if (
        !Number.isFinite(base) ||
        base <= 0 ||
        !Number.isFinite(multiplier) ||
        multiplier <= 0 ||
        multiplier > 1
    ) {
        throw new RangeError('Invalid mastery reward')
    }
    const micros = Math.round(base * multiplier * Number(MASTERY_XP_SCALE))
    if (!Number.isSafeInteger(micros)) {
        throw new RangeError('Mastery award is too large')
    }
    return BigInt(Math.max(1, micros))
}
