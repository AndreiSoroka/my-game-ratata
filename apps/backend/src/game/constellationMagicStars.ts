import { ABILITY_DEFINITIONS, type AbilityId } from '@my-game-ratata/contracts'

import { type ConstellationStar, star } from './constellationDefinition'

export const magicLevelAbilities = [
    [
        'chains',
        2,
        'Удерживает всех поблизости на месте, пока маг поддерживает заклинание.',
    ],
    [
        'blink',
        4,
        'Мгновенно перемещает мага назад относительно направления взгляда.',
    ],
    [
        'dispel_magic',
        5,
        'Снимает Барьеры и завершает Оковы в области действия.',
    ],
    [
        'city_portal',
        6,
        'Открывает двусторонний переход в ближайший город на одну минуту.',
    ],
] as const satisfies ReadonlyArray<readonly [AbilityId, number, string]>

const ranks = [1, 2, 3] as const
const rankLevels = [0, 2, 5, 8] as const
export const spellManaMultipliers = [1, 0.8, 0.6, 0.4] as const
export const manaRestMultipliers = [1, 1.1, 1.25, 1.5] as const

export const magicStars: ConstellationStar[] = [
    ...magicLevelAbilities.map(
        ([abilityId, level, description]): ConstellationStar => ({
            ...star(
                'magic',
                abilityId,
                ABILITY_DEFINITIONS[abilityId].name,
                description
            ),
            acquisition: 'event',
            minimumLevel: level,
            kind: 'ability',
            effectType: 'active',
            activationAbilityId: abilityId,
        })
    ),
    {
        ...star(
            'magic',
            'chains_duration',
            'Долгие оковы',
            'Оковы можно поддерживать до 10 секунд.',
            ['chains'],
            ['chains'],
            'chains'
        ),
        minimumLevel: 5,
    },
    {
        ...star(
            'magic',
            'chains_party',
            'Свобода отряда',
            'Живые участники вашего отряда могут перемещаться внутри ваших Оков.',
            ['chains_duration'],
            ['chains'],
            'chains'
        ),
        minimumLevel: 8,
    },
    ...ranks.map((rank) => {
        const reduction = Math.round((1 - spellManaMultipliers[rank]) * 100)
        return {
            ...star(
                'magic',
                `spell_economy${String(rank)}`,
                `Контроль маны ${roman(rank)}`,
                `Заклинания стоят на ${String(reduction)}% меньше маны.`,
                [rank === 1 ? 'root' : `spell_economy${String(rank - 1)}`],
                ['arcana']
            ),
            minimumLevel: rankLevels[rank],
        }
    }),
    ...ranks.map((rank) => {
        const bonus = Math.round((manaRestMultipliers[rank] - 1) * 100)
        return {
            ...star(
                'magic',
                `mana_rest${String(rank)}`,
                `Восстановление маны ${roman(rank)}`,
                `Мана восстанавливается на ${String(bonus)}% быстрее, когда вы стоите вне боя и не поддерживаете заклинание.`,
                [rank === 1 ? 'root' : `mana_rest${String(rank - 1)}`],
                ['arcana']
            ),
            minimumLevel: rankLevels[rank],
        }
    }),
]

function roman(rank: number): string {
    return 'I'.repeat(rank)
}
