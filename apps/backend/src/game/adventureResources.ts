import type {
    AdventureClientMessage,
    AdventureMaterial,
    AdventureRecipeId,
    AdventureResourceNode,
    FarmPlotSnapshot,
    GameEventPayload,
    GatherOperation,
    Vector2,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'

import {
    adventureMaterialLabels,
    adventureRecipes,
    createAdventureResourceNodes,
} from './adventureResourceData'
import { resetMartyrStreak } from './martyr'
export {
    adventureMaterialLabels,
    adventureRecipes,
    createAdventureResourceNodes,
} from './adventureResourceData'

import { AdventureFarming } from './adventureFarming'
import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import { loadHarvestSources } from './harvestData'
import { HarvestResources, type PlantInspection } from './harvestResources'
import {
    type GatherInspection,
    type HarvestDrops,
    inspectGather,
} from './harvestWork'
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

export class AdventureResources {
    private readonly nodes: AdventureResourceNode[]
    private readonly farms: AdventureFarming
    private readonly harvesting: HarvestResources

    public constructor(
        nodes?: AdventureResourceNode[],
        private readonly onCraft?: (
            actor: GameCharacter,
            recipeId: AdventureRecipeId,
            instanceId: string
        ) => void,
        drops?: HarvestDrops,
        farmRandom?: () => number
    ) {
        this.nodes = structuredClone(
            nodes ?? [
                ...createAdventureResourceNodes(),
                ...loadHarvestSources(),
            ]
        )
        this.harvesting = new HarvestResources(this.nodes, drops)
        this.farms = new AdventureFarming(undefined, farmRandom)
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
                    navigation,
                    message.operation
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
        navigation?: NavigationService,
        operation: GatherOperation = 'harvest'
    ): GameEventPayload[] {
        const node = this.nodes.find((candidate) => candidate.id === nodeId)
        if (node?.source !== undefined) {
            return this.harvesting.gather(
                actor,
                state,
                node,
                now,
                navigation,
                operation
            )
        }

        if (node === undefined || operation !== 'harvest') {
            return []
        }
        if (genericResourceUnavailable(actor, node, now, navigation)) {
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
        resetMartyrStreak(actor)
        node.remaining -= 1
        state.gatherAllowedAt = now + 800
        setNotice(state, `Собрано: ${adventureMaterialLabels[node.kind]} +1.`)
        return []
    }

    public previewPlant(
        actor: GameCharacter,
        position: Vector2,
        navigation: NavigationService
    ): PlantInspection {
        return this.harvesting.previewPlant(actor, position, navigation)
    }

    public inspectGather(
        actor: GameCharacter,
        state: PlayerAdventure,
        nodeId: string,
        operation: GatherOperation,
        now: number,
        navigation: NavigationService
    ): GatherInspection {
        const node = this.nodes.find((candidate) => candidate.id === nodeId)
        if (node === undefined) {
            return { status: 'stop', reason: 'Источник исчез.' }
        }
        if (node.source !== undefined) {
            return inspectGather(actor, state, node, operation, now, navigation)
        }
        if (
            operation !== 'harvest' ||
            node.remaining <= 0 ||
            actor.locationId !== node.locationId
        ) {
            return { status: 'stop' }
        }
        if (now < state.gatherAllowedAt) {
            return { status: 'cooldown' }
        }
        if (!canPerformSkillAction(actor, now)) {
            return { status: 'stop' }
        }
        if (!navigation.hasLineOfSight(actor.position, node.position)) {
            return { status: 'stop' }
        }
        if (distance(actor.position, node.position) <= 48) {
            return { status: 'ready' }
        }
        return navigation.findPathWorld(actor.position, node.position).length >
            0
            ? { status: 'range', target: node.position }
            : { status: 'stop' }
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

        resetMartyrStreak(actor)
        this.onCraft?.(actor, recipe.id, output.instanceId)
        setNotice(state, `Готово: ${recipe.label}.`)
        return [
            { actorId: actor.id, itemId: recipe.itemId, kind: 'item_pickup' },
        ]
    }
}

function genericResourceUnavailable(
    actor: GameCharacter,
    node: AdventureResourceNode,
    now: number,
    navigation?: NavigationService
): boolean {
    return (
        !canPerformSkillAction(actor, now) ||
        actor.locationId !== node.locationId ||
        distance(actor.position, node.position) > 48 ||
        (navigation !== undefined &&
            !navigation.hasLineOfSight(actor.position, node.position))
    )
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
