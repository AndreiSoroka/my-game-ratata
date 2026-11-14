import type {
    AdventureClientMessage,
    AdventureMaterial,
    AdventureRecipe,
    AdventureRecipeId,
    AdventureResourceNode,
    FarmPlotSnapshot,
    GameEventPayload,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'
import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'

import { AdventureFarming } from './adventureFarming'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { loadHarvestSources } from './harvestData'
import { HarvestResources } from './harvestResources'
import type { HarvestDrops } from './harvestWork'
import {
    addInventoryItems,
    countInventoryItem,
    craftInventoryItems,
    createItemInstance,
} from './inventory'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import { canPerformSkillAction } from './skillProgression'

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
}

export class AdventureResources {
    private readonly nodes: AdventureResourceNode[]
    private readonly farms = new AdventureFarming()
    private readonly harvesting: HarvestResources

    public constructor(
        nodes?: AdventureResourceNode[],
        private readonly onCraft?: (
            actor: GameCharacter,
            recipeId: AdventureRecipeId,
            instanceId: string
        ) => void,
        drops?: HarvestDrops
    ) {
        this.nodes = structuredClone(
            nodes ?? [
                ...createAdventureResourceNodes(),
                ...loadHarvestSources(),
            ]
        )
        this.harvesting = new HarvestResources(this.nodes, drops)
    }

    public update(
        now: number,
        navigationFor: (id: string) => NavigationService,
        characters: Iterable<GameCharacter>,
        occupants: (
            locationId: string
        ) => readonly WorldObjectBounds[] = () => []
    ): void {
        this.harvesting.update(now, navigationFor, characters, occupants)
    }

    public snapshot(locationId?: string): AdventureResourceNode[] {
        return structuredClone(
            locationId === undefined
                ? this.nodes
                : this.nodes.filter((node) => node.locationId === locationId)
        )
    }

    public snapshotFarms(locationId: string, now: number): FarmPlotSnapshot[] {
        return this.farms.snapshot(locationId, now)
    }

    public handle(
        actor: GameCharacter,
        state: PlayerAdventure,
        message: Extract<
            AdventureClientMessage,
            { type: 'gather' | 'craft' | 'farm_action' | 'plant_tree' }
        >,
        now: number,
        navigation?: NavigationService
    ): GameEventPayload[] {
        switch (message.type) {
            case 'gather':
                return this.gather(
                    actor,
                    state,
                    message.nodeId,
                    now,
                    navigation
                )
            case 'plant_tree':
                return this.harvesting.plant(
                    actor,
                    state,
                    message.position,
                    now,
                    navigation
                )
            case 'craft':
                return this.craft(actor, state, message.recipeId, now)
            case 'farm_action':
                return this.farms.act(actor, state, message, now, navigation)
        }
    }

    public gather(
        actor: GameCharacter,
        state: PlayerAdventure,
        nodeId: string,
        now: number,
        navigation?: NavigationService
    ): GameEventPayload[] {
        const node = this.nodes.find((candidate) => candidate.id === nodeId)
        if (node?.source !== undefined) {
            return this.harvesting.gather(actor, state, node, now, navigation)
        }

        if (
            !canPerformSkillAction(actor, now) ||
            actor.tags.has('state.retired') ||
            actor.locationId !== node?.locationId ||
            distance(actor.position, node.position) > 48 ||
            blockedResource(actor, node, navigation)
        ) {
            setNotice(
                state,
                'Подойди к ресурсу в своей локации: не дальше 48 шагов.'
            )
            return []
        }

        if (node.remaining <= 0) {
            setNotice(
                state,
                'Этот ресурс исчерпан. Ищи другой источник в соседних землях.'
            )
            return []
        }

        if (now < state.gatherAllowedAt) {
            setNotice(state, 'Подожди немного перед следующим сбором.')
            return []
        }

        if (
            !addInventoryItems(actor.inventory, [createItemInstance(node.kind)])
        ) {
            setNotice(
                state,
                'В рюкзаке нет места для ресурса. Освободи ячейку.'
            )
            return []
        }
        node.remaining -= 1
        state.gatherAllowedAt = now + 800
        setNotice(state, `Собрано: ${adventureMaterialLabels[node.kind]} +1.`)
        return []
    }

    public craft(
        actor: GameCharacter,
        state: PlayerAdventure,
        recipeId: AdventureRecipeId,
        now = Date.now()
    ): GameEventPayload[] {
        const recipe = adventureRecipes.find(
            (candidate) => candidate.id === recipeId
        )

        if (
            !canPerformSkillAction(actor, now) ||
            actor.tags.has('state.retired') ||
            recipe === undefined
        ) {
            setNotice(state, 'Сейчас этот предмет создать нельзя.')
            return []
        }

        const costs = Object.entries(recipe.cost) as Array<
            [AdventureMaterial, number]
        >

        if (
            costs.some(
                ([kind, amount]) =>
                    countInventoryItem(actor.inventory, kind) < amount
            )
        ) {
            setNotice(state, 'Не хватает материалов. Собери ресурсы в мире.')
            return []
        }

        const output = createItemInstance(recipe.itemId)
        if (!craftInventoryItems(actor.inventory, recipe.cost, [output])) {
            setNotice(state, 'В рюкзаке нет места для созданного предмета.')
            return []
        }

        this.onCraft?.(actor, recipe.id, output.instanceId)
        setNotice(state, `Готово: ${recipe.label}.`)
        return [
            { actorId: actor.id, itemId: recipe.itemId, kind: 'item_pickup' },
        ]
    }
}

function blockedResource(
    actor: GameCharacter,
    node: AdventureResourceNode,
    navigation?: NavigationService
): boolean {
    return (
        navigation !== undefined &&
        !navigation.hasLineOfSight(actor.position, node.position)
    )
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

export function isResourceCommand(
    message: AdventureClientMessage
): message is Extract<
    AdventureClientMessage,
    { type: 'gather' | 'plant_tree' | 'farm_action' | 'craft' }
> {
    return (
        message.type === 'gather' ||
        message.type === 'plant_tree' ||
        message.type === 'farm_action' ||
        message.type === 'craft'
    )
}
