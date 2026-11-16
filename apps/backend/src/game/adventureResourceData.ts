import {
    type AdventureMaterial,
    type AdventureRecipe,
    type AdventureResourceNode,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

export const adventureRecipes: AdventureRecipe[] = [
    {
        cost: { stone: 2, wood: 1 },
        id: 'stone_axe',
        itemId: 'stone_axe',
        label: 'Сделать каменный топор',
    },
    {
        cost: { grain: 3 },
        id: 'bake_bread',
        itemId: 'food',
        label: 'Испечь хлеб',
    },
    {
        cost: { herbs: 3 },
        id: 'food',
        itemId: 'food',
        label: 'Приготовить походную еду',
    },
    {
        cost: { fiber: 3 },
        id: 'boots',
        itemId: 'boots',
        label: 'Сплести сапоги',
    },
    {
        cost: { scrap: 3, wood: 2 },
        id: 'simple_sword',
        itemId: 'simple_sword',
        label: 'Собрать простой меч',
    },
    {
        cost: { scrap: 3, wood: 2 },
        id: 'axe',
        itemId: 'axe',
        label: 'Сделать топор',
    },
    {
        cost: { scrap: 3, wood: 2 },
        id: 'pickaxe',
        itemId: 'pickaxe',
        label: 'Сделать кирку',
    },
]

export const adventureMaterialLabels: Record<AdventureMaterial, string> = {
    fiber: 'волокно',
    grain: 'зерно',
    herbs: 'травы',
    scrap: 'металл',
    wood: 'дерево',
    stone: 'камень',
    sapling: 'саженцы',
    brushwood: 'хворост',
}

export function createAdventureResourceNodes(): AdventureResourceNode[] {
    const nodes: AdventureResourceNode[] = []
    const points: Array<{ kind: AdventureMaterial; x: number; y: number }> = [
        { kind: 'herbs', x: 664, y: 712 },
        { kind: 'fiber', x: 648, y: 728 },
        { kind: 'scrap', x: 680, y: 696 },
    ]

    for (const { id: locationId } of WORLD_LOCATION_DEFINITIONS) {
        for (const { kind, x, y } of points) {
            nodes.push({
                id: `${locationId}-${kind}`,
                kind,
                locationId,
                position: { x, y },
                remaining: 8,
            })
        }
    }

    return nodes
}
