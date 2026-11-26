import {
    type ConstellationNodeSnapshot,
    type ConstellationSnapshot,
    DISCLOSED_AUTHORED_TEXT_KEY,
    type LocalizedMessage,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    constellationPaths,
    type ConstellationStar,
} from './constellationCatalog'
import { constellationEnglishText } from './constellationEnglishText'
import {
    constellationCatalogFor,
    constellationWireId,
} from './constellationNodes'
import { minimumConstellationLevel } from './constellationRequirements'
import { observedConstellationCardEffectRows } from './constellationResultDisclosure'
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
    const catalog = constellationCatalogFor(actor.archetype)
    const learned = new Set(
        catalog.filter((node) => unlocked(actor, node)).map((node) => node.id)
    )
    const visible = catalog.filter(
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
        paths: constellationPaths
            .filter(
                ({ id }) =>
                    id !== 'fat_zombie' || actor.archetype === 'fat_zombie'
            )
            .map(({ id, name, description, color }) => ({
                id,
                color,
                unlocked: learned.has(`${id}.root`),
                ...(learned.has(`${id}.root`) ? { name, description } : {}),
            })),
        nodes: visible.map((node) => observeNode(actor, node, learned, sky)),
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
    actor: GameCharacter,
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
    const levelLocked =
        !learned &&
        actor.progression.masteries[node.constellationId].level <
            minimumConstellationLevel(node.id, actor.heroClass)
    const english = learned ? constellationEnglishText[node.id] : undefined
    return {
        id: constellationWireId(node.id),
        constellationId: node.constellationId,
        ...position,
        unlocked: learned,
        ...(levelLocked ? { levelLocked: true } : {}),
        parents: node.parents.map(constellationWireId),
        ...(learned
            ? {
                  kind: node.kind,
                  name: node.name,
                  description: node.description,
                  ...(english === undefined
                      ? {}
                      : {
                            nameMessage: disclosedText(english[0]),
                            descriptionMessage: disclosedText(english[1]),
                        }),
                  effectType: node.effectType,
                  ...observedEffects(node.id, learnedIds),
              }
            : {}),
    }
}

function observedEffects(nodeId: string, learnedIds: ReadonlySet<string>) {
    const rows = observedConstellationCardEffectRows(nodeId, learnedIds)
    return rows === undefined
        ? {}
        : {
              effects: rows.map(([russian]) => russian),
              effectMessages: rows.map(([russian, english]) =>
                  russian === english ? null : disclosedText(english)
              ),
          }
}

function disclosedText(text: string): LocalizedMessage {
    return { key: DISCLOSED_AUTHORED_TEXT_KEY, params: { text } }
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
