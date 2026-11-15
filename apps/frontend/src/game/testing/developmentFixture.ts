import type { CharacterSnapshot, ConstellationSnapshot } from '@my-game-ratata/contracts'

// Storybook/test-only data: production receives the observer-filtered snapshot.
import { constellationPaths } from '../../../../backend/src/game/constellationCatalog'
import {
    constellationEdgeWaypoints,
    constellationLayout,
} from '../../../../backend/src/game/constellationLayout'
import {
    constellationWireId,
    fullConstellationCatalog,
} from '../../../../backend/src/game/constellationNodes'
import { characterFixture } from './characterFixture'

export const fixtureStarId = constellationWireId
export function constellationFixture(full = false): ConstellationSnapshot {
    const opened = new Set(
        full
            ? fullConstellationCatalog.map((node) => node.id)
            : ['prayer.root', 'prayer.radius1', 'prayer.omen1', 'life.root', 'life.hp1']
    )
    const visible = fullConstellationCatalog.filter(
        (node) =>
            node.parents.length === 0 ||
            opened.has(node.id) ||
            node.parents.some((parent) => opened.has(parent))
    )
    const visibleIds = new Set(visible.map((node) => node.id))
    return {
        version: 1,
        layout: structuredClone(constellationLayout),
        paths: constellationPaths.map((path) => ({
            id: path.id,
            color: path.color,
            unlocked: opened.has(`${path.id}.root`),
            ...(opened.has(`${path.id}.root`)
                ? { name: path.name, description: path.description }
                : {}),
        })),
        nodes: visible.map((node) => ({
            id: constellationWireId(node.id),
            constellationId: node.constellationId,
            x: node.x,
            y: node.y,
            parents: node.parents.filter((id) => visibleIds.has(id)).map(constellationWireId),
            unlocked: opened.has(node.id),
            ...(opened.has(node.id)
                ? {
                      kind: node.kind,
                      name: node.name,
                      description: node.description,
                      effectType: node.effectType,
                      effects: node.effects,
                  }
                : {}),
        })),
        edges: visible.flatMap((node) =>
            node.parents
                .filter((id) => visibleIds.has(id))
                .map((from) => ({
                    from: constellationWireId(from),
                    to: constellationWireId(node.id),
                    via: constellationEdgeWaypoints(from, node.id),
                }))
        ),
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
