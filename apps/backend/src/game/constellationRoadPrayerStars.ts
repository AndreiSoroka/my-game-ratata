import { ROAD_PRAYER_RULES } from '@my-game-ratata/contracts'

import { type ConstellationStar, star } from './constellationDefinition'

export const roadPrayerStars: ConstellationStar[] = [
    {
        ...star(
            'prayer_road',
            'walk',
            'На ходу',
            'Слова молитвы ложатся в такт вашим шагам.',
            ['root'],
            [],
            'pray_road'
        ),
        results: ['Молитву странника можно читать обычным шагом.'],
    },
    {
        ...star(
            'prayer_road',
            'shoulder',
            'Подставить плечо',
            'Когда у спутника иссякают силы, вы помогаете ему сделать ещё один рывок.',
            ['walk'],
            [],
            'pray_road'
        ),
        results: [
            `Если Путник ответил и выбранная цель восстановила силы от молитвы, её следующий рывок в течение ${String(ROAD_PRAYER_RULES.dashDiscountDurationMs / 1000)} секунд стоит на ${String(ROAD_PRAYER_RULES.dashDiscount)} энергии меньше.`,
        ],
    },
    {
        ...star(
            'prayer_road',
            'bard',
            'Навыки барда',
            'Знакомая мелодия разносится дальше по дороге.',
            ['root'],
            [],
            'pray_road'
        ),
        results: [
            `Площадь действия Походной песни увеличивается в ${String(ROAD_PRAYER_RULES.bardAreaMultiplier)} раза.`,
        ],
    },
]
