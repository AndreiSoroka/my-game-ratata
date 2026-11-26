import {
    type AdventureClientMessage,
    type AdventureMaterial,
    type AdventureRecipeId,
    type AdventureResourceNode,
    authoredMessage,
    type FarmPlotSnapshot,
    type GameEventPayload,
    type GatherOperation,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import {
    adventureMaterialLabels,
    adventureRecipes,
    createAdventureResourceNodes,
} from './adventureResourceData'
import {
    bestResourceSnapshot,
    type ResourcePriority,
    type ResourceTieBreak,
    snapshotResources,
} from './adventureResourceSelection'
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
import { interactionRangeText } from './interactionRangeText'
import {
    addInventoryItems,
    countInventoryItem,
    craftInventoryItems,
    createItemInstance,
} from './inventory'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { setAuthoredNotice, setNotice } from './notices'
import { canPerformSkillAction } from './skillProgression'

const resourceInteractionRange = 48

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

    public snapshot(locationId?: string, nodeId?: string) {
        return snapshotResources(this.nodes, locationId, nodeId)
    }

    public selectSnapshot(
        priority: ResourcePriority,
        tieBreak: ResourceTieBreak
    ): AdventureResourceNode | undefined {
        return bestResourceSnapshot(this.nodes, priority, tieBreak)
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
                `Для сбора нужен ресурс ${interactionRangeText(resourceInteractionRange, navigation?.grid.tileWidth)} в твоей локации.`,
                authoredMessage('resource.nearby')
            )
            return []
        }

        if (node.remaining <= 0) {
            setAuthoredNotice(state, 'resource.depleted')
            return []
        }

        if (now < state.gatherAllowedAt) {
            setAuthoredNotice(state, 'notice.waitToGather')
            return []
        }

        if (
            !addInventoryItems(actor.inventory, [createItemInstance(node.kind)])
        ) {
            setAuthoredNotice(state, 'resource.noSpace')
            return []
        }
        resetMartyrStreak(actor)
        node.remaining -= 1
        state.gatherAllowedAt = now + 800
        setAuthoredNotice(state, 'resource.gathered', {
            material: adventureMaterialLabels[node.kind],
        })
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
        if (
            distance(actor.position, node.position) <= resourceInteractionRange
        ) {
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
            setAuthoredNotice(state, 'notice.cannotCraft')
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
            setAuthoredNotice(state, 'notice.noMaterials')
            return []
        }

        const output = createItemInstance(recipe.itemId)
        if (!craftInventoryItems(actor.inventory, recipe.cost, [output])) {
            setAuthoredNotice(state, 'notice.noCraftingSpace')
            return []
        }

        resetMartyrStreak(actor)
        this.onCraft?.(actor, recipe.id, output.instanceId)
        setAuthoredNotice(state, 'resource.crafted', { recipe: recipe.label })
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
        distance(actor.position, node.position) > resourceInteractionRange ||
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
