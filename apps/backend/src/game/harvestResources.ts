import {
    type AdventureResourceNode,
    type GameEventPayload,
    type GatherOperation,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
    type HarvestDrops,
    rejectWork as reject,
    resolveGather,
    stumpBounds,
    TREE_GROW_MS,
    workAnimation,
    workReady,
} from './harvestWork'
import { consumeInventoryItems } from './inventory'
export { STONE_REGROW_MS, TREE_GROW_MS } from './harvestWork'
import type { NavigationService } from './navigation'
import { setNotice } from './notices'
import {
    canPlantAt,
    occupied,
    overlaps,
    resourceApproach,
    resourceReachable,
} from './resourcePlacement'

export interface PlantInspection {
    position: Vector2
    bounds: WorldObjectBounds
    available: boolean
    reason?: string
    approach?: Vector2
}

export class HarvestResources {
    private nextPlantId = 0
    private readonly dirty = new Set<string>()
    private characters: GameCharacter[] = []
    private occupants: (locationId: string) => readonly WorldObjectBounds[] =
        () => []

    public constructor(
        private readonly nodes: AdventureResourceNode[],
        private readonly drops?: HarvestDrops
    ) {
        for (const node of nodes) {
            if (node.source !== undefined) {
                this.dirty.add(node.locationId)
            }
        }
    }

    public update(
        now: number,
        navigationFor: (id: string) => NavigationService,
        characters: Iterable<GameCharacter>,
        occupants: (
            locationId: string
        ) => readonly WorldObjectBounds[] = () => []
    ): void {
        this.characters = [...characters]
        this.occupants = occupants
        for (const node of this.nodes) {
            if (!this.canGrow(node, now) || node.matureBounds === undefined) {
                continue
            }
            node.phase = 'ready'
            node.readyAt = 0
            node.remaining = 8
            node.collisionBounds = { ...node.matureBounds }
            this.dirty.add(node.locationId)
        }
        for (const locationId of this.dirty) {
            this.sync(locationId, navigationFor(locationId))
        }
    }

    public gather(
        actor: GameCharacter,
        state: PlayerAdventure,
        node: AdventureResourceNode,
        now: number,
        navigation?: NavigationService,
        operation: GatherOperation = 'harvest'
    ): GameEventPayload[] {
        const events = resolveGather(
            actor,
            state,
            node,
            now,
            navigation,
            this.drops,
            operation
        )
        if (
            events.length > 0 &&
            node.remaining === 0 &&
            navigation !== undefined
        ) {
            this.dirty.add(node.locationId)
            this.sync(node.locationId, navigation)
        }
        return events
    }

    public plant(
        actor: GameCharacter,
        state: PlayerAdventure,
        position: Vector2,
        now: number,
        navigation?: NavigationService
    ): GameEventPayload[] {
        if (
            !validPlantIntent(actor, state, position, now) ||
            navigation === undefined
        ) {
            return reject(state, 'Сейчас дерево посадить нельзя.')
        }
        const check = this.previewPlant(actor, position, navigation)
        const { position: center, bounds } = check
        if (
            !check.available ||
            !resourceReachable(actor, bounds, navigation) ||
            occupied(bounds, [actor], actor.locationId)
        ) {
            return reject(
                state,
                check.reason ?? 'Подойди к свободной точке рядом с участком.'
            )
        }
        const tile = navigation.worldToTile(center)
        if (actor.energy < 5) {
            return reject(state, 'Для посадки нужно 5 сил.')
        }
        if (!consumeInventoryItems(actor.inventory, { sapling: 1 })) {
            return reject(state, 'Нужен саженец в рюкзаке.')
        }
        const node: AdventureResourceNode = {
            id: `${actor.locationId}:planted:${String(tile.x)}:${String(tile.y)}:${String(++this.nextPlantId)}`,
            kind: 'wood',
            locationId: actor.locationId,
            position: center,
            source: 'tree',
            remaining: 0,
            visual: 'forest',
            treeProfile: 'forest',
            treeSize: 'adult',
            bounds: { ...bounds },
            matureBounds: { ...bounds },
        }
        node.phase = 'growing'
        node.remaining = 0
        node.readyAt = now + TREE_GROW_MS
        node.collisionBounds = stumpBounds(center)
        this.nodes.push(node)
        actor.drainEnergy(5)
        workAnimation(actor, state, now, 2_000)
        this.dirty.add(actor.locationId)
        this.sync(actor.locationId, navigation)
        const text = setNotice(
            state,
            'Дерево посажено. Оно вырастет через 10 минут; за ним могут ухаживать все жители.'
        )
        return [{ kind: 'tree_plant', actorId: actor.id, text }]
    }

    /** Authoritative geometry shared by preview and final atomic planting. */
    public previewPlant(
        actor: GameCharacter,
        position: Vector2,
        navigation: NavigationService
    ): PlantInspection {
        const finite =
            Number.isFinite(position.x) && Number.isFinite(position.y)
        const center = finite
            ? navigation.tileToWorld(navigation.worldToTile(position))
            : { x: 0, y: 0 }
        const bounds = {
            x: center.x - 24,
            y: center.y - 24,
            width: 48,
            height: 32,
        }
        const fail = (reason: string): PlantInspection => ({
            position: center,
            bounds,
            available: false,
            reason,
        })
        if (!finite || !actor.alive || actor.tags.has('state.retired')) {
            return fail('Сейчас дерево посадить нельзя.')
        }
        if (
            this.occupants(actor.locationId).some((area) =>
                overlaps(area, bounds)
            ) ||
            !canPlantAt(
                navigation,
                bounds,
                actor,
                this.nodes,
                this.characters.filter((other) => other !== actor)
            )
        ) {
            return fail(
                'Нужна свободная земля: убери пень; дороги, вода, грядки, здания и проходы не подходят.'
            )
        }
        const approach = resourceApproach(actor, bounds, navigation)
        if (approach === undefined) {
            return fail('К участку нет доступного подхода.')
        }
        return { position: center, bounds, available: true, approach }
    }

    private canGrow(node: AdventureResourceNode, now: number): boolean {
        const readyAt = node.readyAt ?? 0
        const bounds = node.matureBounds
        return (
            readyAt > 0 &&
            now >= readyAt &&
            (node.phase === 'growing' || node.phase === 'depleted') &&
            bounds !== undefined &&
            !occupied(bounds, this.characters, node.locationId) &&
            !this.occupants(node.locationId).some((area) =>
                overlaps(area, bounds)
            )
        )
    }

    private sync(locationId: string, navigation: NavigationService): void {
        navigation.setResourceObstacles(
            this.nodes
                .filter(
                    (node) =>
                        node.locationId === locationId &&
                        node.source !== undefined &&
                        (node.propId === undefined ||
                            navigation.grid.baseSolid !== undefined)
                )
                .flatMap((node) =>
                    node.collisionBounds === undefined
                        ? []
                        : [node.collisionBounds]
                )
        )
        for (const actor of this.characters) {
            if (actor.locationId !== locationId || !actor.hasPath()) {
                continue
            }
            const target = actor.path.at(-1)
            if (
                target !== undefined &&
                actor.path.some((point) =>
                    navigation.isSolidTile(navigation.worldToTile(point))
                )
            ) {
                actor.setPath(navigation.findPathWorld(actor.position, target))
            }
        }
        this.dirty.delete(locationId)
    }
}

function validPlantIntent(
    actor: GameCharacter,
    state: PlayerAdventure,
    position: Vector2,
    now: number
): boolean {
    return (
        workReady(actor, state, now) &&
        Number.isFinite(position.x) &&
        Number.isFinite(position.y)
    )
}
