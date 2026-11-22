import {
    ABILITY_DEFINITIONS,
    type AbilityId,
    type ConstellationId,
    ROAD_PRAYER_RULES,
} from '@my-game-ratata/contracts'

import {
    constellationPaths,
    type ConstellationStar,
    constellationStars,
} from './constellationCatalog'
import { lifeStars } from './constellationLifeStars'
import { withPrayerLore } from './constellationPrayerLore'
import { revivalStars } from './constellationRevivalStars'
import { roadPrayerStars } from './constellationRoadPrayerStars'

const rootAbilities: Partial<Record<ConstellationId, AbilityId>> = {
    arrow: 'shot',
    prayer: 'pray',
    prayer_road: 'pray_road',
    prayer_lantern: 'pray_lantern',
    prayer_grave: 'pray_grave',
}
const rootNames: Partial<Record<ConstellationId, string>> = {
    prayer: 'Молитва',
    prayer_road: 'Молитва странника',
    prayer_lantern: 'Молитва ясности',
    prayer_grave: 'Молитва праха',
}

const roots: ConstellationStar[] = constellationPaths.map((path) => {
    const ability = rootAbilities[path.id]
    return {
        acquisition: 'root',
        minimumLevel: 0,
        id: `${path.id}.root`,
        constellationId: path.id,
        name: rootNames[path.id] ?? path.name,
        description: path.description,
        parents: [],
        evidence: [],
        kind: 'root',
        effectType: ability === undefined ? 'passive' : 'active',
        ...(ability === undefined
            ? {}
            : { ability, activationAbilityId: ability }),
        ...(path.id === 'blade'
            ? {
                  results: [
                      'Урон клинка увеличен на 10%.',
                      'Время обычного удара сокращено на 5%.',
                      'Стоимость обычного удара уменьшена на 5%.',
                      'Уклонение от ближних физических атак увеличено на 5 процентных пунктов.',
                      'Полученное оглушение короче на 5%.',
                  ],
              }
            : {}),
        ...(path.id === 'prayer'
            ? {
                  effects: [
                      'Лечит вас или союзника.',
                      'Очищает могилы от тёмных сил.',
                  ],
              }
            : {}),
        ...(path.id === 'prayer_road'
            ? {
                  effects: [
                      `Пока звучит Походная песня, вы и видимые союзники в области её действия восстанавливаете энергию в ${String(ROAD_PRAYER_RULES.energyRegenMultiplier)} раз быстрее.`,
                      'В конце молитвы Путник может вернуть дополнительные силы выбранной цели.',
                  ],
              }
            : {}),
    }
})

function special(
    id: string,
    path: ConstellationId,
    kind: 'ability' | 'joint',
    name: string,
    description: string,
    parents: string[],
    activationAbilityId?: AbilityId
): ConstellationStar {
    return {
        acquisition: id === 'magic.fireball' ? 'learned' : 'event',
        minimumLevel:
            id === 'magic.fireball'
                ? 3
                : id === 'magic.greater_fireball'
                  ? 10
                  : id.endsWith('.revive')
                    ? 5
                    : 0,
        id,
        constellationId: path,
        kind,
        name,
        description,
        parents,
        evidence: [],
        effectType: activationAbilityId === undefined ? 'passive' : 'active',
        ...(activationAbilityId === undefined ? {} : { activationAbilityId }),
    }
}

const explicitAbilities = [
    special(
        'magic.fireball',
        'magic',
        'ability',
        ABILITY_DEFINITIONS.fireball.name,
        'Огненная стрела взрывается в выбранной точке и обжигает всех в области.',
        ['magic.root'],
        'fireball'
    ),
    special(
        'magic.greater_fireball',
        'magic',
        'ability',
        ABILITY_DEFINITIONS.greater_fireball.name,
        'Мощный взрыв обжигает всех в области, включая союзников и мага.',
        ['magic.fireball'],
        'greater_fireball'
    ),
    special(
        'prayer.revive',
        'prayer',
        'ability',
        'Воскрешение',
        'Позволяет поднимать павших товарищей, душа которых не успела уйти в мир иной.',
        ['prayer.root']
    ),
    special(
        'prayer_grave.revive',
        'prayer_grave',
        'ability',
        'Возвращение праха',
        'Позволяет возвращать павших товарищей из числа нежити, душа которых ещё не покинула этот мир.',
        ['prayer_grave.root']
    ),
]

const joints = [
    special(
        'prayer.last_light',
        'prayer',
        'joint',
        'Последний огонёк',
        'Пока ваше здоровье ниже 20% из-за вражеских ран, ваша молитва лечит на 1000% сильнее и совершается на 20% быстрее. Каждое лечение стоит 30% максимальной маны. Вы всегда лечите себя в первую очередь. Прервать молитву может только смерть; после неё молитвы Матери недоступны 10 секунд.',
        ['prayer.gift1', 'life.hp1']
    ),
    special(
        'magic.runic_echo',
        'magic',
        'joint',
        'Руническое эхо',
        'Полезное боевое заклинание усиливает следующий Выстрел на 10% на пять секунд.',
        ['magic.spark_damage', 'arrow.damage1']
    ),
]

/** Complete authored graph. Owner snapshots disclose only earned metadata and the immediate frontier. */
const authoredNodes = [
    ...roots,
    ...constellationStars,
    ...explicitAbilities,
    ...joints,
    ...revivalStars,
    ...roadPrayerStars,
    ...lifeStars,
]
export const fullConstellationCatalog: readonly ConstellationStar[] =
    Object.freeze(
        authoredNodes.map((node) => freezeStar(withPrayerLore({ ...node })))
    )

function freezeStar(node: ConstellationStar): Readonly<ConstellationStar> {
    Object.freeze(node.parents)
    Object.freeze(node.evidence)
    if (node.results !== undefined) {
        Object.freeze(node.results)
    }
    if (node.effects !== undefined) {
        Object.freeze(node.effects)
    }
    return Object.freeze(node)
}

const wireIds = new Map(
    fullConstellationCatalog.map((node, index) => [
        node.id,
        `node-${String(index)}`,
    ])
)

export function constellationWireId(id: string): string {
    const wire = wireIds.get(id)
    if (wire === undefined) {
        throw new Error(`Unknown constellation node: ${id}`)
    }
    return wire
}
