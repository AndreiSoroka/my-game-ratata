import type {
    ConstellationNodeSnapshot,
    ConstellationSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationPaths, constellationStars } from './constellationCatalog'
import { hasStar } from './constellations'

/** Opaque stable wire IDs avoid revealing the effect in an unknown star's ID. */
function wireId(id: string): string {
    const index = constellationStars.findIndex((node) => node.id === id)
    return index < 0 ? id : `star-${String(index)}`
}

export function snapshotConstellations(
    actor: GameCharacter
): ConstellationSnapshot {
    const roots: ConstellationNodeSnapshot[] = constellationPaths.map(
        (path) => ({
            id: `${path.id}.root`,
            constellationId: path.id,
            x: path.x,
            y: path.y,
            kind: 'root',
            unlocked: hasStar(actor, `${path.id}.root`),
            name: path.name,
            description: path.description,
            parents: [],
        })
    )
    const nodes = [
        ...roots,
        ...passiveNodes(actor),
        ...abilityNodes(actor),
        ...jointNodes(actor),
    ]
    const visible = new Set(nodes.map((node) => node.id))
    for (const node of nodes) {
        node.parents = node.parents.filter((id) => visible.has(id))
    }
    return {
        version: 1,
        paths: constellationPaths.map(({ id, name, description, color }) => ({
            id,
            name,
            description,
            color,
            unlocked: hasStar(actor, `${id}.root`),
        })),
        nodes,
        edges: nodes.flatMap((node) =>
            node.parents.map((from) => ({ from, to: node.id }))
        ),
    }
}

function passiveNodes(actor: GameCharacter): ConstellationNodeSnapshot[] {
    return constellationStars.flatMap((node) => {
        const unlocked = hasStar(actor, node.id)
        if (!unlocked && !node.parents.some((id) => hasStar(actor, id))) {
            return []
        }
        const path = constellationPaths.find(
            (path) => path.id === node.constellationId
        )
        if (path === undefined) {
            return []
        }
        const siblings = constellationStars.filter(
            (other) => other.constellationId === node.constellationId
        )
        const index = siblings.indexOf(node)
        const angle = index * 2.399963229728653
        const radius = 68 + Math.floor(index / 5) * 50
        return [
            {
                id: wireId(node.id),
                constellationId: node.constellationId,
                x: path.x + Math.cos(angle) * radius,
                y: path.y + Math.sin(angle) * radius,
                kind: node.kind,
                unlocked,
                parents: node.parents.map(wireId),
                ...(unlocked
                    ? { name: node.name, description: node.description }
                    : {}),
            },
        ]
    })
}

function abilityNodes(actor: GameCharacter): ConstellationNodeSnapshot[] {
    return [
        {
            id: 'magic.fireball',
            name: 'Огненный шар',
            unlocked: actor.progression.skills.fireball.unlocked,
            x: 530,
            y: 405,
            parents: ['magic.root'],
            description:
                'Изучите три главы у учёного и попросите обучить заклинанию.',
        },
        {
            id: 'magic.greater_fireball',
            name: 'Большой огненный шар',
            unlocked: actor.progression.skills.greater_fireball.unlocked,
            x: 660,
            y: 430,
            parents: ['magic.fireball'],
            description: 'Открывается на десятом уровне Огненного шара.',
        },
        {
            id: 'prayer.revive',
            name: 'Воскрешение',
            unlocked:
                actor.abilities.known.has('pray') &&
                (actor.heroClass === 'cleric' ||
                    actor.progression.skills.miracles.level >= 5),
            x: 1260,
            y: 410,
            parents: ['prayer.root'],
            description:
                'Доступно клирику или на пятом уровне Чудес. Требуется подходящий покровитель.',
        },
    ].map((node) => ({
        ...node,
        constellationId: node.id.startsWith('magic') ? 'magic' : 'prayer',
        kind: 'ability',
    }))
}

function jointNodes(actor: GameCharacter): ConstellationNodeSnapshot[] {
    const joints = [
        {
            id: 'prayer.last_light',
            name: 'Последний огонёк',
            description:
                'Дар на 10% сильнее при здоровье ниже 20% после вражеских ран.',
            parents: ['prayer.gift1', 'life.hp1'],
            constellationId: 'prayer' as const,
            x: 900,
            y: 490,
        },
        {
            id: 'magic.runic_echo',
            name: 'Руническое эхо',
            description:
                'Полезное боевое заклинание усиливает следующий Выстрел на 10% на пять секунд.',
            parents: ['magic.spark_damage', 'arrow.damage1'],
            constellationId: 'magic' as const,
            x: 460,
            y: 490,
        },
    ]
    return joints.flatMap((node, index) => {
        const unlocked = hasStar(actor, node.id)
        const { name, description, ...position } = node
        return unlocked || node.parents.some((id) => hasStar(actor, id))
            ? [
                  {
                      ...position,
                      id: `joint-${String(index)}`,
                      parents: node.parents.map(wireId),
                      kind: 'joint',
                      unlocked,
                      ...(unlocked ? { name, description } : {}),
                  },
              ]
            : []
    })
}
