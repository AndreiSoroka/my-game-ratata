import type { CharacterSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'

import { characterFixture } from './characterFixture'

const paths: ConstellationSnapshot['paths'] = [
    {
        id: 'blade',
        name: 'Клинок',
        description: 'Начните путь настоящим ударом меча.',
        color: '#e6a48b',
        unlocked: false,
    },
    {
        id: 'magic',
        name: 'Магия',
        description: 'Изучите Искру или Барьер у учёного.',
        color: '#91bce8',
        unlocked: false,
    },
    {
        id: 'prayer',
        name: 'Молитва',
        description: 'Изучите молитву у клирика.',
        color: '#ead491',
        unlocked: true,
    },
    {
        id: 'arrow',
        name: 'Стрела',
        description: 'Изучите Выстрел у ветерана.',
        color: '#a4cba1',
        unlocked: false,
    },
    {
        id: 'life',
        name: 'Жизнь',
        description: 'Приключения научат понимать своё тело.',
        color: '#e5afc0',
        unlocked: true,
    },
    {
        id: 'shadow',
        name: 'Тень',
        description: 'Двигайтесь скрытно рядом с врагами.',
        color: '#afa0d2',
        unlocked: false,
    },
]

export function constellationFixture(): ConstellationSnapshot {
    const nodes: ConstellationSnapshot['nodes'] = paths.map((path, index) => ({
        id: `${path.id}.root`,
        constellationId: path.id,
        x: (index % 3) * 220 + 80,
        y: Math.floor(index / 3) * 200 + 70,
        kind: 'root',
        unlocked: path.unlocked,
        name: path.name,
        description: path.description,
        parents: [],
    }))
    nodes.push(
        {
            id: 'prayer.radius1',
            constellationId: 'prayer',
            x: 460,
            y: 145,
            kind: 'passive',
            unlocked: true,
            name: 'Далёкий зов',
            description: 'Радиус молитвы увеличен на одну клетку.',
            parents: ['prayer.root'],
        },
        {
            id: 'prayer.radius2',
            constellationId: 'prayer',
            x: 390,
            y: 210,
            kind: 'passive',
            unlocked: false,
            parents: ['prayer.radius1'],
        },
        {
            id: 'prayer.omen1',
            constellationId: 'prayer',
            x: 585,
            y: 155,
            kind: 'passive',
            unlocked: true,
            name: 'Знамения',
            description: 'Вы чувствуете намёк о настроении покровителя.',
            parents: ['prayer.root'],
        },
        {
            id: 'life.hp1',
            constellationId: 'life',
            x: 235,
            y: 330,
            kind: 'passive',
            unlocked: true,
            name: 'Пульс жизни',
            description: 'Вы оцениваете здоровье с шагом 25.',
            parents: ['life.root'],
        }
    )
    return {
        version: 1,
        paths,
        nodes,
        edges: nodes.flatMap((node) => node.parents.map((from) => ({ from, to: node.id }))),
    }
}

export function developmentCharacterFixture(): CharacterSnapshot {
    const range = (lower: number, upper: number) => ({ kind: 'range' as const, lower, upper })
    return characterFixture('development-hero', {
        nickname: 'Андрей Сорока',
        heroClass: 'cleric',
        health: { kind: 'percent', percent: 62 },
        abilities: {
            known: ['pray'],
            cooldowns: {},
            casting: null,
            barrier: null,
            prayer: { radius: 64, durationMs: 3000, manaCost: 5, area: false, harm: false },
        },
        characterSheet: {
            health: { current: range(0, 25), max: range(25, 50), hasCapacity: true },
            mana: { current: range(0, 50), max: range(50, 100), hasCapacity: true },
            energy: { current: range(50, 100), max: range(100, 150), hasCapacity: true },
            moveSpeed: range(6, 7),
            dodgeChance: range(0, 0.05),
            attacks: [
                {
                    id: 'attack',
                    name: 'Обычный удар',
                    damage: { min: range(0, 5), max: range(5, 10) },
                    cooldownMs: range(500, 1000),
                    critChance: range(0, 0.05),
                },
            ],
        },
        progression: {
            skills: [
                {
                    id: 'faith',
                    name: 'Вера',
                    level: 3,
                    practice: 2,
                    practiceToNext: 12,
                    unlocked: true,
                },
                {
                    id: 'miracles',
                    name: 'Чудеса',
                    level: 2,
                    practice: 3,
                    practiceToNext: 10,
                    unlocked: true,
                },
                {
                    id: 'vitality',
                    name: 'Жизненный опыт',
                    level: 2,
                    practice: 1,
                    practiceToNext: 8,
                    unlocked: true,
                },
            ],
            deity: {
                id: 'hearth',
                name: 'Очаг',
                domain: 'Исцеление',
                omen: 'Тепло едва заметно.',
                perception: 'hint',
                mood: null,
                successChance: null,
                changesInMs: null,
            },
            practicedBranches: ['faith', 'survival'],
            magicChaptersRead: 0,
            magicChaptersTotal: 3,
            totalEarnedLevels: 4,
            trainingMultiplier: 1,
            resurrectionUnlocked: false,
            constellations: constellationFixture(),
        },
    })
}
