import type {
    ConstellationNodeSnapshot,
    ConstellationSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    constellationPaths,
    type ConstellationStar,
} from './constellationCatalog'
import {
    constellationEdgeWaypoints,
    constellationLayout,
} from './constellationLayout'
import {
    constellationWireId,
    fullConstellationCatalog,
} from './constellationNodes'
import { hasStar } from './constellations'
import { canUseResurrection } from './skillProgression'

export function snapshotConstellations(
    actor: GameCharacter
): ConstellationSnapshot {
    const learned = new Set(
        fullConstellationCatalog
            .filter((node) => unlocked(actor, node))
            .map((node) => node.id)
    )
    const visible = fullConstellationCatalog.filter(
        (node) =>
            node.kind === 'root' ||
            learned.has(node.id) ||
            node.parents.some((id) => learned.has(id))
    )
    const visibleIds = new Set(visible.map((node) => node.id))
    return {
        version: 1,
        layout: structuredClone(constellationLayout),
        paths: constellationPaths.map(({ id, name, description, color }) => ({
            id,
            color,
            unlocked: learned.has(`${id}.root`),
            ...(learned.has(`${id}.root`) ? { name, description } : {}),
        })),
        nodes: visible.map((node) => observeNode(node, learned.has(node.id))),
        edges: visible.flatMap((node) =>
            node.parents
                .filter((id) => visibleIds.has(id))
                .map((from) => observedEdge(from, node.id))
        ),
    }
}

function observedEdge(from: string, to: string) {
    const via = constellationEdgeWaypoints(from, to)
    return {
        from: constellationWireId(from),
        to: constellationWireId(to),
        ...(via === undefined ? {} : { via }),
    }
}

function observeNode(
    node: ConstellationStar,
    learned: boolean
): ConstellationNodeSnapshot {
    return {
        id: constellationWireId(node.id),
        constellationId: node.constellationId,
        x: node.x,
        y: node.y,
        unlocked: learned,
        parents: node.parents.map(constellationWireId),
        ...(learned
            ? {
                  kind: node.kind,
                  name: node.name,
                  description: node.description,
                  effectType: node.effectType,
                  ...(node.effects === undefined
                      ? {}
                      : { effects: [...node.effects] }),
              }
            : {}),
    }
}

function unlocked(actor: GameCharacter, node: ConstellationStar): boolean {
    if (node.id === 'magic.fireball') {
        return actor.progression.skills.fireball.unlocked
    }
    if (node.id === 'magic.greater_fireball') {
        return actor.progression.skills.greater_fireball.unlocked
    }
    if (node.id === 'prayer.revive') {
        return canUseResurrection(actor, 'pray')
    }
    if (node.id === 'prayer_grave.revive') {
        return canUseResurrection(actor, 'pray_grave')
    }
    return hasStar(actor, node.id)
}
