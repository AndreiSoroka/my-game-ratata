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
    constellationWireId,
    fullConstellationCatalog,
} from './constellationNodes'
import { observedConstellationCardEffects } from './constellationResultDisclosure'
import { hasStar } from './constellations'
import {
    type CachedConstellationLayout,
    readCachedConstellationLayout,
} from './personalConstellationSky'
import { canUseResurrection } from './skillProgression'

export function snapshotConstellations(
    actor: GameCharacter
): ConstellationSnapshot {
    const sky = readCachedConstellationLayout(actor)
    if (sky === undefined) {
        throw new Error(
            'Prepare the personal constellation layout before private observation'
        )
    }
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
        layout: {
            ...structuredClone(sky.layout),
            ...(sky.layout.centerNodeId === undefined
                ? {}
                : {
                      centerNodeId: constellationWireId(
                          sky.layout.centerNodeId
                      ),
                  }),
        },
        paths: constellationPaths.map(({ id, name, description, color }) => ({
            id,
            color,
            unlocked: learned.has(`${id}.root`),
            ...(learned.has(`${id}.root`) ? { name, description } : {}),
        })),
        nodes: visible.map((node) => observeNode(node, learned, sky)),
        edges: visible.flatMap((node) =>
            node.parents
                .filter((id) => visibleIds.has(id))
                .map((from) => observedEdge(from, node.id, sky))
        ),
    }
}

function observedEdge(
    from: string,
    to: string,
    sky: CachedConstellationLayout
) {
    const via = sky.edgeWaypoints[`${from}>${to}`]
    return {
        from: constellationWireId(from),
        to: constellationWireId(to),
        ...(sky.crossLinks.includes(`${from}>${to}`)
            ? { crossLink: true }
            : {}),
        ...(via === undefined
            ? {}
            : { via: via.map((point) => ({ ...point })) }),
    }
}

function observeNode(
    node: ConstellationStar,
    learnedIds: ReadonlySet<string>,
    sky: CachedConstellationLayout
): ConstellationNodeSnapshot {
    const position = sky.positions[node.id]
    if (position === undefined) {
        throw new Error(
            `Personal sky is missing a constellation node: ${node.id}`
        )
    }
    const learned = learnedIds.has(node.id)
    const effects = learned
        ? observedConstellationCardEffects(node.id, learnedIds)
        : undefined
    return {
        id: constellationWireId(node.id),
        constellationId: node.constellationId,
        ...position,
        unlocked: learned,
        parents: node.parents.map(constellationWireId),
        ...(learned
            ? {
                  kind: node.kind,
                  name: node.name,
                  description: node.description,
                  effectType: node.effectType,
                  ...(effects === undefined ? {} : { effects }),
              }
            : {}),
    }
}

function unlocked(actor: GameCharacter, node: ConstellationStar): boolean {
    if (node.id === 'magic.fireball') {
        return actor.abilities.known.has('fireball')
    }
    if (node.id === 'magic.greater_fireball') {
        return actor.abilities.known.has('greater_fireball')
    }
    if (node.id === 'prayer.revive') {
        return canUseResurrection(actor, 'pray')
    }
    if (node.id === 'prayer_grave.revive') {
        return canUseResurrection(actor, 'pray_grave')
    }
    return hasStar(actor, node.id)
}
