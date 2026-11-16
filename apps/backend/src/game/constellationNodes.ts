import type { AbilityId, ConstellationId } from '@my-game-ratata/contracts'

import {
    constellationPaths,
    type ConstellationStar,
    constellationStars,
} from './constellationCatalog'
import { revivalStars } from './constellationRevivalStars'

const rootAbilities: Partial<Record<ConstellationId, AbilityId>> = {
    arrow: 'shot',
    prayer: 'pray',
    prayer_road: 'pray_road',
    prayer_lantern: 'pray_lantern',
    prayer_grave: 'pray_grave',
}
const rootNames: Partial<Record<ConstellationId, string>> = {
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
        ...(path.id === 'prayer'
            ? {
                  effects: [
                      'Лечит вас или союзника.',
                      'Очищает могилы от тёмных сил.',
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
        'Огненный шар',
        'Вы бросаете огненный шар в выбранную цель.',
        ['magic.root'],
        'fireball'
    ),
    special(
        'magic.greater_fireball',
        'magic',
        'ability',
        'Большой огненный шар',
        'Вы обрушиваете на выбранную цель мощный огненный шар.',
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
]
export const fullConstellationCatalog: readonly ConstellationStar[] =
    Object.freeze(authoredNodes.map((node) => freezeStar({ ...node })))

function freezeStar(node: ConstellationStar): Readonly<ConstellationStar> {
    Object.freeze(node.parents)
    Object.freeze(node.evidence)
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
