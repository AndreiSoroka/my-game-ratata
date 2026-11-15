import type {
    AbilityId,
    ConstellationId,
    ConstellationNodeSnapshot,
} from '@my-game-ratata/contracts'

import { combatStars } from './constellationCombatStars'
import { otherStars } from './constellationOtherStars'

export interface ConstellationStar {
    id: string
    constellationId: ConstellationId
    name: string
    description: string
    parents: string[]
    evidence: string[]
    kind: ConstellationNodeSnapshot['kind']
    ability?: AbilityId
    x: number
    y: number
}

export const constellationPaths = [
    {
        id: 'blade',
        name: 'Клинок',
        description:
            'Воину доступен сразу. Остальным — после полезного удара мечом по врагу.',
        color: '#edaa78',
        x: 240,
        y: 220,
    },
    {
        id: 'magic',
        name: 'Магия',
        description:
            'Изучите Искру или Барьер у учёного. Практикуйтесь попаданиями, защитой и передачей знаний.',
        color: '#b8a4ed',
        x: 680,
        y: 220,
    },
    {
        id: 'prayer',
        name: 'Молитва',
        description:
            'Клирику доступна сразу. Других обучит дружественный клирик или служитель святилища.',
        color: '#eddb9b',
        x: 1120,
        y: 220,
    },
    {
        id: 'arrow',
        name: 'Стрела',
        description:
            'Лучнику доступна сразу. Остальным — после обучения Выстрелу у ветерана.',
        color: '#9ed4db',
        x: 240,
        y: 740,
    },
    {
        id: 'life',
        name: 'Жизнь',
        description:
            'Переживите настоящий вражеский урон. Знание тела растёт от потери и восстановления здоровья.',
        color: '#b5da9a',
        x: 680,
        y: 740,
    },
    {
        id: 'shadow',
        name: 'Тень',
        description:
            'Начните настоящую скрытную вылазку или допустимую попытку кражи.',
        color: '#c4b2d7',
        x: 1120,
        y: 740,
    },
] satisfies Array<{
    id: ConstellationId
    name: string
    description: string
    color: string
    x: number
    y: number
}>

export const constellationStars: ConstellationStar[] = [
    ...combatStars,
    ...otherStars,
]

export function star(
    path: ConstellationId,
    suffix: string,
    name: string,
    description: string,
    parents: string[] = ['root'],
    evidence: string[] = [],
    ability?: AbilityId
): ConstellationStar {
    return {
        id: `${path}.${suffix}`,
        constellationId: path,
        name,
        description,
        parents: parents.map((id) => (id.includes('.') ? id : `${path}.${id}`)),
        evidence,
        kind: 'passive',
        ...(ability === undefined ? {} : { ability }),
        x: 0,
        y: 0,
    }
}
