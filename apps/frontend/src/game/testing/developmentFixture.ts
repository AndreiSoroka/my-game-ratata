import type {
    AbilityId,
    CharacterSnapshot,
    ConstellationId,
    ConstellationSnapshot,
    HeroClass,
} from '@my-game-ratata/contracts'

import { resolveConstellationCardEffects } from '../../../../backend/src/game/constellationCardEffects'
// Storybook/test-only data: production receives the observer-filtered snapshot.
import { constellationPaths } from '../../../../backend/src/game/constellationCatalog'
import { generateConstellationLayout } from '../../../../backend/src/game/constellationLayout'
import {
    constellationWireId,
    fullConstellationCatalog,
} from '../../../../backend/src/game/constellationNodes'
import { characterFixture } from './characterFixture'
import { masteriesFixture } from './masteryFixture'

export const fixtureStarId = constellationWireId
export const fixtureHeroPaths: Record<HeroClass, ConstellationId> = {
    vanguard: 'blade',
    arcanist: 'magic',
    cleric: 'prayer',
    ranger: 'arrow',
}
const fixtureAbilities: Record<HeroClass, AbilityId[]> = {
    vanguard: [],
    arcanist: ['spark', 'barrier'],
    cleric: ['pray'],
    ranger: ['shot'],
}
export function constellationFixture(
    full = false,
    heroClass: HeroClass = 'cleric'
): ConstellationSnapshot {
    const personal = generateConstellationLayout(
        fullConstellationCatalog,
        `storybook-personal-sky-${heroClass}`,
        fixtureHeroPaths[heroClass]
    )
    const opened = new Set(
        full
            ? fullConstellationCatalog.map((node) => node.id)
            : [
                  `${fixtureHeroPaths[heroClass]}.root`,
                  'life.root',
                  'life.hp1',
                  ...(heroClass === 'cleric'
                      ? ['prayer.revive', 'prayer.radius1', 'prayer.omen1']
                      : []),
              ]
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
        layout: {
            ...structuredClone(personal.layout),
            centerNodeId: constellationWireId(`${fixtureHeroPaths[heroClass]}.root`),
        },
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
            ...personal.positions[node.id]!,
            parents: node.parents.filter((id) => visibleIds.has(id)).map(constellationWireId),
            unlocked: opened.has(node.id),
            ...(opened.has(node.id)
                ? {
                      kind: node.kind,
                      name: node.name,
                      description: node.description,
                      effectType: node.effectType,
                      effects: resolveConstellationCardEffects(node.id, opened),
                  }
                : {}),
        })),
        edges: visible.flatMap((node) =>
            node.parents
                .filter((id) => visibleIds.has(id))
                .map((from) => ({
                    from: constellationWireId(from),
                    to: constellationWireId(node.id),
                    via: personal.edgeWaypoints[`${from}>${node.id}`],
                }))
        ),
    }
}

export function developmentCharacterFixture(heroClass: HeroClass = 'cleric'): CharacterSnapshot {
    const range = (lower: number, upper: number) => ({ kind: 'range' as const, lower, upper })
    return characterFixture('development-hero', {
        nickname: 'Андрей Сорока',
        heroClass,
        health: { kind: 'percent', percent: 62 },
        abilities: {
            known: [...fixtureAbilities[heroClass]],
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
            masteries: masteriesFixture({ prayer: 3, life: 2 }),
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
            magicChaptersRead: 0,
            magicChaptersTotal: 3,
            resurrectionUnlocked: heroClass === 'cleric',
            constellations: constellationFixture(false, heroClass),
        },
    })
}
