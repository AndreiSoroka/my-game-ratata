import {
    CENTER_LOCATION_ID,
    FARM_GROW_MS,
    FARM_HARVEST_GRAIN,
    FARM_HARVEST_SEED_DROPS,
    FARM_SOW_ENERGY,
    FARM_SOW_SEEDS,
    ITEM_DEFINITIONS,
} from '@my-game-ratata/contracts'

import { capacityFor } from '../game/harvestData'
import {
    harvestOutputs,
    STONE_REGROW_MS,
    TREE_GROW_MS,
} from '../game/harvestRules'
import type { KnowledgeArticle } from './knowledgeCorpus'

/** Assertions for authored prose, derived from the same definitions/rules as work. */
export function knowledgeFactValues(): Readonly<Record<string, number>> {
    const axe = ITEM_DEFINITIONS.axe.gathering?.tree
    const sword = ITEM_DEFINITIONS.simple_sword.gathering?.tree
    const pickaxe = ITEM_DEFINITIONS.pickaxe.gathering?.stone
    if (axe === undefined || sword === undefined || pickaxe === undefined) {
        throw new Error('Missing authoritative gathering definitions')
    }
    return {
        ...treeYieldFacts('adult'),
        ...treeYieldFacts('small'),
        'forestry.axe.energy': axe.energy,
        'forestry.axe.durationMs': axe.durationMs,
        'forestry.axe.wear': axe.wear,
        'forestry.sword.energy': sword.energy,
        'forestry.sword.durationMs': sword.durationMs,
        'forestry.sword.wear': sword.wear,
        'forestry.growthMs': TREE_GROW_MS,
        'mining.regrowthMs': STONE_REGROW_MS,
        'mining.pickaxe.energy': pickaxe.energy,
        'mining.pickaxe.durationMs': pickaxe.durationMs,
        'mining.pickaxe.wear': pickaxe.wear,
        'farming.growthMs': FARM_GROW_MS,
        'farming.sow.energy': FARM_SOW_ENERGY,
        'farming.sow.seeds': FARM_SOW_SEEDS,
        'farming.harvest.grain': FARM_HARVEST_GRAIN,
        'farming.seedDrops.min': Math.min(
            ...FARM_HARVEST_SEED_DROPS.map((drop) => drop.quantity)
        ),
        'farming.seedDrops.max': Math.max(
            ...FARM_HARVEST_SEED_DROPS.map((drop) => drop.quantity)
        ),
        'equipment.axe.condition': requiredCondition('axe'),
        'equipment.stoneAxe.condition': requiredCondition('stone_axe'),
        'equipment.sword.condition': requiredCondition('simple_sword'),
    }
}

export function validateKnowledgeFacts(
    articles: readonly KnowledgeArticle[]
): void {
    const actual = knowledgeFactValues()
    for (const article of articles) {
        for (const [id, expected] of Object.entries(article.facts)) {
            if (!Object.hasOwn(actual, id)) {
                throw new Error(`${article.id}: unknown knowledge fact ${id}`)
            }
            if (actual[id] !== expected) {
                throw new Error(
                    `${article.id}: ${id} declares ${String(expected)}, rules give ${String(actual[id])}`
                )
            }
            const representations = [expected]
            if (id.endsWith('Ms')) {
                representations.push(expected / 1000, expected / 60_000)
            }
            const normalized = article.text.replace(
                /(?<=\d)[ \u00a0](?=\d{3}\b)/gu,
                ''
            )
            if (
                !representations.some((value) =>
                    new RegExp(
                        `(?<![\\d.,])${String(value).replace('.', '[.,]')}(?!\\d|[.,]\\d)`,
                        'u'
                    ).test(normalized)
                )
            ) {
                throw new Error(
                    `${article.id}: declared fact ${id} is absent from its prose`
                )
            }
        }
    }
}

function requiredCondition(id: 'axe' | 'stone_axe' | 'simple_sword'): number {
    const value = ITEM_DEFINITIONS[id].maxDurability
    if (value === undefined) {
        throw new Error(`Missing condition for ${id}`)
    }
    return value
}

function treeYieldFacts(size: 'adult' | 'small'): Record<string, number> {
    const capacity = capacityFor('tree', size)
    const totals = new Map<string, number>()
    for (let remaining = capacity; remaining > 0; remaining--) {
        const outputs = harvestOutputs(
            {
                id: `knowledge-check:${size}`,
                locationId: CENTER_LOCATION_ID,
                position: { x: 0, y: 0 },
                source: 'tree',
                treeSize: size,
                remaining,
                kind: 'wood',
            },
            'harvest'
        )
        for (const item of outputs) {
            totals.set(
                item.itemId,
                (totals.get(item.itemId) ?? 0) + (item.quantity ?? 1)
            )
        }
    }
    return Object.fromEntries(
        ['wood', 'sapling', 'brushwood'].map((item) => [
            `forestry.${size}.${item === 'sapling' ? 'saplings' : item}`,
            totals.get(item) ?? 0,
        ])
    )
}
