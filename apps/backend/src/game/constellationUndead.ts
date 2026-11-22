import { star } from './constellationDefinition'
import { undeadCombatStars } from './constellationUndeadCombatStars'
import { undeadSurvivalStars } from './constellationUndeadSurvivalStars'
import { undeadTacticsStars } from './constellationUndeadTacticsStars'

export const undeadExpansionStars = [
    ...undeadCombatStars,
    ...undeadSurvivalStars,
    ...undeadTacticsStars,
]

export const undeadStars = [
    {
        ...star(
            'undead',
            'arcane_joints',
            'Магические суставы',
            'Базовый максимум здоровья поднимается с 10 до 50 HP.',
            ['root']
        ),
        acquisition: 'event' as const,
        minimumLevel: 2,
    },
    {
        ...star(
            'undead',
            'arcane_frame',
            'Зачарованный остов',
            'Базовый максимум здоровья поднимается с 50 до 80 HP.',
            ['arcane_joints']
        ),
        minimumLevel: 3,
    },
    {
        ...star(
            'undead',
            'hollow_bones',
            'Полые кости',
            'Получаемый урон от стрел уменьшается на 20%.',
            ['arcane_joints']
        ),
        minimumLevel: 3,
    },
    {
        ...star(
            'undead',
            'hollow_bones2',
            'Рунические рёбра',
            'Получаемый урон от стрел уменьшается на 35% суммарно.',
            ['hollow_bones']
        ),
        minimumLevel: 6,
    },
    {
        ...star(
            'undead',
            'arcane_endurance',
            'Магическая выносливость',
            'Максимальный запас энергии увеличивается на 45.',
            ['arcane_joints']
        ),
        minimumLevel: 3,
    },
    {
        ...star(
            'undead',
            'arcane_endurance2',
            'Неутомимый остов',
            'Максимальный запас энергии увеличивается на 90 суммарно.',
            ['arcane_endurance']
        ),
        minimumLevel: 6,
    },
    {
        ...star(
            'undead',
            'consume_half',
            'Эхо павшего',
            'За каждую последующую победу Нежить получает копию половины опыта побеждённого.',
            ['arcane_joints']
        ),
        minimumLevel: 5,
    },
    {
        ...star(
            'undead',
            'consume_full',
            'Память костей',
            'За каждую последующую победу Нежить получает копию всего опыта побеждённого.',
            ['consume_half']
        ),
        minimumLevel: 10,
    },
    ...undeadExpansionStars,
]

export function resolveUndeadBonuses(ids: ReadonlySet<string>) {
    return {
        undeadHealthBonus: undeadHealthBonus(ids),
        undeadEnergyBonus: undeadEnergyBonus(ids),
        rangedPhysicalDamageMultiplier: undeadArrowArmor(ids),
    }
}

export function undeadArrowArmor(ids: ReadonlySet<string>): number {
    return ids.has('undead.hollow_bones2')
        ? 0.65
        : ids.has('undead.hollow_bones')
          ? 0.8
          : 1
}

export function undeadHealthBonus(ids: ReadonlySet<string>): number {
    return ids.has('undead.arcane_frame')
        ? 70
        : ids.has('undead.arcane_joints')
          ? 40
          : 0
}

export function undeadEnergyBonus(ids: ReadonlySet<string>): number {
    return ids.has('undead.arcane_endurance2')
        ? 90
        : ids.has('undead.arcane_endurance')
          ? 45
          : 0
}
