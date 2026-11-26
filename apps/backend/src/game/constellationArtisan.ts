import {
    ARTISAN_LUMBER_RULES,
    ARTISAN_STARS,
    MASTERY_NAMES,
} from '@my-game-ratata/contracts'

import type { ConstellationStar } from './constellationDefinition'
import type { StarText } from './constellationEnglishText'
import type { SkyPoint } from './constellationGeometry'

export const artisanPath = {
    id: 'artisan' as const,
    name: MASTERY_NAMES.artisan,
    description:
        'Исправным подходящим инструментом можно работать прямо из рюкзака.',
    color: '#dab583',
}

const { root, hand, economy, oneStrike, endurance } = ARTISAN_STARS
const energySavings = Math.round(
    (1 - ARTISAN_LUMBER_RULES.energyMultiplier) * 100
)
const energyBonus = ARTISAN_LUMBER_RULES.energyBonus

const lumberjack = [
    {
        id: hand,
        name: 'Мастерская рука',
        description: 'Для добычи бревна нужно два удара вместо трёх.',
        english: [
            'Skilled hand',
            'Harvesting a log takes two strikes instead of three.',
        ],
    },
    {
        id: economy,
        name: 'Экономный замах',
        description: `Удар при рубке дерева расходует на ${String(energySavings)}% меньше энергии.`,
        english: [
            'Efficient swing',
            `A strike while logging costs ${String(energySavings)}% less energy.`,
        ],
    },
    {
        id: oneStrike,
        name: 'Точный удар',
        description: 'Для добычи бревна достаточно одного удара.',
        english: ['Precise strike', 'Harvesting a log takes one strike.'],
    },
    {
        id: endurance,
        name: 'Рабочая выносливость',
        description: `Максимальный запас энергии увеличен на ${String(energyBonus)} единиц.`,
        english: [
            'Work endurance',
            `You gain ${String(energyBonus)} maximum energy.`,
        ],
    },
] as const

export const artisanStars: ConstellationStar[] = lumberjack.map(
    ({ id, name, description }, index) => ({
        acquisition: 'random',
        minimumLevel: index + 1,
        id,
        constellationId: artisanPath.id,
        name,
        description,
        parents: [lumberjack[index - 1]?.id ?? root],
        evidence: [],
        kind: 'passive',
        effectType: 'passive',
    })
)

export const artisanEnglishText: Readonly<Record<string, StarText>> = {
    [root]: [
        'Artisan',
        'You can use a suitable tool in working condition straight from your backpack.',
    ],
    ...Object.fromEntries(lumberjack.map(({ id, english }) => [id, english])),
}

export const artisanTemplatePositions: Readonly<Record<string, SkyPoint>> = {
    [root]: { x: 0, y: 0 },
    [hand]: { x: 200, y: -190 },
    [economy]: { x: 275, y: -450 },
    [oneStrike]: { x: 185, y: -720 },
    [endurance]: { x: 360, y: -955 },
}
