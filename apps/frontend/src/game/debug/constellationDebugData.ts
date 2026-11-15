import type {
    ConstellationId,
    ConstellationNodeSnapshot,
    ConstellationSnapshot,
    HeroClass,
} from '@my-game-ratata/contracts'

import { constellationPaths } from '../../../../backend/src/game/constellationCatalog'
import { generateConstellationLayout } from '../../../../backend/src/game/constellationLayout'
import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'

interface ConstellationDebugOptions {
    heroClass: HeroClass
    seed: string
}

const startingPaths: Record<HeroClass, ConstellationId> = {
    vanguard: 'blade',
    arcanist: 'magic',
    cleric: 'prayer',
    ranger: 'arrow',
}

/** Standalone debug preview: no character identity, learned state, socket or gameplay randomness. */
export function buildConstellationDebugSnapshot({
    heroClass,
    seed,
}: ConstellationDebugOptions): ConstellationSnapshot {
    const realized = generateConstellationLayout(
        fullConstellationCatalog,
        seed,
        startingPaths[heroClass]
    )
    const nodes: ConstellationNodeSnapshot[] = fullConstellationCatalog.map((node) => {
        const position = realized.positions[node.id]
        if (position === undefined) {
            throw new Error(`Debug sky is missing a constellation node: ${node.id}`)
        }
        return {
            id: node.id,
            constellationId: node.constellationId,
            ...position,
            kind: node.kind,
            unlocked: true,
            name: node.name,
            description: node.description,
            effectType: node.effectType,
            ...(node.effects === undefined ? {} : { effects: [...node.effects] }),
            parents: [...node.parents],
        }
    })
    return {
        version: 1,
        layout: structuredClone(realized.layout),
        paths: constellationPaths.map((path) => ({ ...path, unlocked: true })),
        nodes,
        edges: nodes.flatMap((node) =>
            node.parents.map((from) => {
                const via = realized.edgeWaypoints[`${from}>${node.id}`]
                return {
                    from,
                    to: node.id,
                    ...(via === undefined ? {} : { via: via.map((point) => ({ ...point })) }),
                }
            })
        ),
    }
}
