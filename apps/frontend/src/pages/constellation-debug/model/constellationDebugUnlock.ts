import {
    ABILITY_DEFINITIONS,
    ARTISAN_STARS,
    type HeroClass,
    MASTERY_NAMES,
} from '@my-game-ratata/contracts'

import { magicLevelAbilities } from '../../../../../backend/src/game/constellationMagicStars'
import { fullConstellationCatalog } from '../../../../../backend/src/game/constellationNodes'
import {
    costsConstellationOpening,
    minimumConstellationLevel,
} from '../../../../../backend/src/game/constellationRequirements'
import { constellationBuildParents } from './constellationMasteryPlan'

export interface ConstellationUnlockDescription {
    conditions: string[]
    chanceBoosts: string[]
}
const artisanOpening = [
    'Все условия обязательны. При их выполнении тратится одно открытие Ремесленника. Если следующая звезда пока недоступна, открытие сохраняется.',
]
const eventConditions: Record<string, string[]> = {
    [ARTISAN_STARS.root]: ['Открывается после добычи последнего бревна из стоящего дерева.'],
    [ARTISAN_STARS.hand]: artisanOpening,
    [ARTISAN_STARS.economy]: artisanOpening,
    [ARTISAN_STARS.oneStrike]: artisanOpening,
    [ARTISAN_STARS.endurance]: artisanOpening,
    'arrow.moving_shot': ['Открывается автоматически на 4-м уровне Стрелы без расхода открытия.'],
    'prayer.martyr': [
        'Уровень Чудес от 0 до 2: до третьего уровня.',
        'Пять последовательных циклов: получить реальный вражеский урон по HP, затем полезно вылечить себя молитвой.',
        'Другие осмысленные действия прерывают последовательность. Тики одного применения считаются одним самолечением; урон манекенам и искусственные раны не засчитываются.',
        'Открывается сразу по событию, без расхода открытия. Однажды полученный навык сохраняется при дальнейшем росте Чудес.',
    ],
    'prayer.last_light': [
        'Открыты «Тёплый дар» и «Прислушаться к телу».',
        'До полезной молитвы у молящегося меньше 20% HP из-за учтённых вражеских ран.',
        'Завершено полезное лечение или воскрешение. Звезда открывается сразу по событию, без случайного выбора.',
    ],
    'magic.runic_echo': [
        'Открыты «Яркая искра» и «Твёрдая рука».',
        'После полезного попадания боевым заклинанием — полезное попадание Быстрым выстрелом по той же цели за 5 секунд.',
        'Тренировочные цели не засчитываются. Звезда открывается сразу по событию, без случайного выбора.',
    ],
    'life.breath': [
        'Накоплено восстановление энергии после успешного сбора ресурсов, посева, посадки деревьев или полезных боевых действий. Объём должен достигнуть тройного базового запаса энергии.',
        'Звезда открывается автоматически при выполнении всех условий и не расходует открытие.',
    ],
}
const evidenceNames: Record<string, string> = {
    swordsmanship: 'удары клинком',
    arcana: 'полезные заклинания',
    barrier: 'поглощение вражеского урона',
    fireball: 'попадания Огненной стрелой',
    greater_fireball: 'попадания Большим огненным шаром',
    chains: 'полезные Оковы',
    marksmanship: 'попадания стрелой',
    quick_shot: 'полезные попадания Быстрым выстрелом',
    sniper_shot: 'полезные попадания Снайперским выстрелом',
    moving_shot: 'полезные попадания Быстрым выстрелом на ходу',
    gift: 'полезное лечение',
    harm: 'урон Кары',
    purify: 'шаги очищения могил',
    wound: 'вражеские раны',
    recovery: 'восстановление после вражеских ран',
    stealth: 'учтённое скрытное перемещение',
    theft: 'успешные кражи',
}

/** Shared requirements are the source of truth; debug text does not grant progression. */
export function describeConstellationUnlock(
    nodeId: string,
    heroClass?: HeroClass
): ConstellationUnlockDescription {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (!node) return { conditions: [], chanceBoosts: [] }
    const minimum = minimumConstellationLevel(nodeId, heroClass)
    const conditions: string[] = []
    if (minimum > 0)
        conditions.push(`${MASTERY_NAMES[node.constellationId]}: уровень не ниже ${minimum}.`)
    const parents = constellationBuildParents(nodeId)
    if (parents.length)
        conditions.push(
            `Открыты все предшественники: ${parents.map((id) => `«${fullConstellationCatalog.find((entry) => entry.id === id)?.name ?? id}»`).join(', ')}.`
        )
    if (node.constellationId === 'fat_zombie') {
        conditions.push(
            node.acquisition === 'root'
                ? 'Открывается у Жирного зомби при появлении и входит в стартовый набор звёзд.'
                : 'Одна случайная доступная звезда открывается за каждое убийство живого противника. Часть звёзд открывается при появлении зомби в подземелье.'
        )
        return { conditions, chanceBoosts: [] }
    }
    if (node.ability)
        conditions.push(`Изучена способность «${ABILITY_DEFINITIONS[node.ability].name}».`)
    conditions.push(...acquisitionConditions(nodeId, node.acquisition, heroClass))
    const chanceBoosts =
        costsConstellationOpening(node, heroClass) && node.evidence.length
            ? [
                  `Вес повышают: ${node.evidence.map((id) => evidenceNames[id] ?? id).join(', ')}.`,
                  'Вес = 1 + min(5, число учтённых событий). Он применяется только после выполнения всех обязательных условий.',
              ]
            : []
    return { conditions, chanceBoosts }
}

function acquisitionConditions(
    nodeId: string,
    acquisition: string,
    heroClass?: HeroClass
): string[] {
    if (nodeId === 'arrow.sniper_shot' && heroClass === 'ranger')
        return ['Следопыт получает Снайперский выстрел при создании без расхода открытия.']
    if (nodeId === 'life.root')
        return [
            'Корень открывается после первой учтённой вражеской раны или первого восстановления энергии, потраченной на успешную полевую работу.',
        ]
    if (eventConditions[nodeId]) return [...eventConditions[nodeId]!]
    if (acquisition === 'root')
        return [
            'Корень открывается при получении соответствующей школы или первой учтённой практике. Стартовый класс получает свой корень сразу.',
        ]
    if (nodeId.endsWith('.revive'))
        return [
            heroClass === 'cleric'
                ? 'Клерик получает это расширение сразу после изучения своей молитвы.'
                : 'При достижении требуемого уровня расширение изученной молитвы открывается автоматически.',
        ]
    if (nodeId === 'magic.fireball')
        return [
            'Изучение у знающего учителя: живые дружественные персонажи в одной локации, прямая видимость, расстояние не больше 64 px.',
        ]
    if (nodeId === 'magic.greater_fireball')
        return [
            'Открывается автоматически после освоения Огненной стрелы и достижения требуемого уровня Магии.',
        ]
    if (magicLevelAbilities.some(([ability]) => nodeId === `magic.${ability}`))
        return ['Открывается автоматически при достижении требуемого уровня Магии.']
    return [
        'Есть накопленное открытие. Все условия обязательны: только после их выполнения звезда входит в случайный пул. Если подходящих звёзд нет, открытие сохраняется.',
    ]
}
