import {
    type AdventureResourceNode,
    type GameEventPayload,
    type Vector2,
    type WorldObjectBounds,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { GameCharacter } from './character'
import {
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
    resourceReachable,
} from './resourcePlacement'

export class HarvestResources {
    private readonly dirty = new Set<string>()
    private characters: GameCharacter[] = []
    private occupants: (locationId: string) => readonly WorldObjectBounds[] =
        () => []

    public constructor(private readonly nodes: AdventureResourceNode[]) {
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
        navigation?: NavigationService
    ): GameEventPayload[] {
        const events = resolveGather(actor, state, node, now, navigation)
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
        const tile = navigation.worldToTile(position)
        const center = navigation.tileToWorld(tile)
        const replacing = this.stumpAt(actor.locationId, center)
        const bounds = replacing?.matureBounds ?? {
            x: center.x - 24,
            y: center.y - 24,
            width: 48,
            height: 32,
        }
        if (
            !resourceReachable(actor, bounds, navigation) ||
            this.occupants(actor.locationId).some((area) =>
                overlaps(area, bounds)
            ) ||
            !canPlantAt(
                navigation,
                bounds,
                actor,
                this.nodes,
                [...this.characters, actor],
                replacing
            )
        ) {
            return reject(
                state,
                'Нужна свободная земля рядом: не дорога, вода, грядка, здание или узкий проход.'
            )
        }
        if (actor.energy < 5) {
            return reject(state, 'Для посадки нужно 5 сил.')
        }
        if (!consumeInventoryItems(actor.inventory, { sapling: 1 })) {
            return reject(state, 'Нужен саженец в рюкзаке.')
        }
        const node: AdventureResourceNode = replacing ?? {
            id: `${actor.locationId}:planted:${String(tile.x)}:${String(tile.y)}`,
            kind: 'wood',
            locationId: actor.locationId,
            position: center,
            source: 'tree',
            remaining: 0,
            visual: 'forest',
            bounds: { ...bounds },
            matureBounds: { ...bounds },
        }
        node.phase = 'growing'
        node.remaining = 0
        node.readyAt = now + TREE_GROW_MS
        node.collisionBounds = stumpBounds(center)
        if (replacing === undefined) {
            this.nodes.push(node)
        }
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

    private stumpAt(
        locationId: string,
        center: Vector2
    ): AdventureResourceNode | undefined {
        return this.nodes.find(
            (node) =>
                node.locationId === locationId &&
                node.phase === 'stump' &&
                Math.hypot(
                    node.position.x - center.x,
                    node.position.y - center.y
                ) < 1
        )
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
