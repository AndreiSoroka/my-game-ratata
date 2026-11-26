import {
    type AdventureResourceNode,
    TREE_PLANT_ENERGY,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveWorkEnergy } from './effectiveParameters'
import type { GatherInspection } from './harvestWork'
import { countInventoryItem } from './inventory'
import { distance } from './math'
import {
    occupied,
    resourceApproach,
    resourceReachable,
} from './resourcePlacement'
import type { GameRoom } from './room'
import { recordWorkerActivity } from './workerActivityState'
import { executeWorkerAdventure } from './workerCommands'
import { hasNoRoute } from './workerFarm'
import { sourceCost, stop, WorkerFieldRoute } from './workerNavigation'

const retryDelay = 5_000
const locationOrder = new Map(
    WORLD_LOCATION_DEFINITIONS.map(({ id }, index) => [id, index])
)
type GroveWork = 'working' | 'felled' | 'no_source' | 'bag_full'

export class WorkerLumberjackGrove {
    public selected: AdventureResourceNode | undefined
    private approachPoint: Vector2 | undefined
    private readonly route = new WorkerFieldRoute()
    private readonly unreachable = new Map<string, number>()
    private nextSearchAt = 0
    private nextPlantAt = 0

    public clearWorksite(): void {
        this.selected = undefined
        this.approachPoint = undefined
    }

    public gather(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): GroveWork {
        const service = room.adventureForWorkers()
        if (this.selected === undefined && now >= this.nextSearchAt) {
            this.selected = this.select(actor, room, now)
            this.nextSearchAt =
                this.selected === undefined ? now + retryDelay : now
        }
        const target = this.selected
        if (target === undefined) {
            wait(actor, now, 'unavailable', 'Ищу доступный лесной участок.')
            return 'no_source'
        }
        const live = service.resourceSnapshot(target.locationId, target.id)[0]
        if (live === undefined || live.remaining <= 0) {
            this.clearWorksite()
            return 'working'
        }
        recordWorkerActivity(
            actor,
            {
                reason: 'working',
                text: 'Выхожу на лесной участок за древесиной.',
                intent: 'work',
                worksite: {
                    kind: 'resource',
                    sourceId: live.id,
                    locationId: live.locationId,
                    position: live.position,
                },
            },
            now
        )
        if (!this.approach(actor, room, live, now)) {
            return 'working'
        }
        return this.chop(actor, room, live, now)
    }

    private chop(
        actor: GameCharacter,
        room: GameRoom,
        node: AdventureResourceNode,
        now: number
    ): GroveWork {
        if (node.source !== undefined) {
            const check = room
                .adventureForWorkers()
                .inspectGather(
                    actor,
                    node.id,
                    'harvest',
                    now,
                    room.navigationFor(actor)
                )
            if (check.status !== 'ready') {
                return this.handleInspection(actor, node, check, now)
            }
        }
        const result = executeWorkerAdventure(
            actor,
            room,
            { type: 'gather', nodeId: node.id },
            now
        )
        if (!result.accepted) {
            return 'no_source'
        }
        const felled =
            node.source === 'tree' &&
            node.remaining === 1 &&
            result.events.some(
                (event) =>
                    event.kind === 'resource_gather' && event.itemId === 'wood'
            )
        return felled ? 'felled' : 'working'
    }

    private handleInspection(
        actor: GameCharacter,
        node: AdventureResourceNode,
        check: GatherInspection,
        now: number
    ): GroveWork {
        if (check.reasonCode === 'capacity') {
            wait(
                actor,
                now,
                'bag',
                check.reason ?? 'В сумке нет места для добычи.'
            )
            return 'bag_full'
        }
        if (check.reasonCode === 'energy') {
            wait(actor, now, 'break', check.reason ?? 'Восстанавливаю силы.')
        } else if (check.status === 'range') {
            this.skip(node, now)
        } else if (check.status === 'stop') {
            wait(
                actor,
                now,
                'unavailable',
                check.reason ?? 'Рубка сейчас недоступна.'
            )
        }
        return 'working'
    }

    private approach(
        actor: GameCharacter,
        room: GameRoom,
        node: AdventureResourceNode,
        now: number
    ): boolean {
        const navigation = room.navigationFor(actor)
        const bounds =
            node.locationId === actor.locationId ? node.bounds : undefined
        if (
            bounds !== undefined &&
            resourceReachable(actor, bounds, navigation)
        ) {
            stop(actor)
            return true
        }
        const point =
            bounds === undefined
                ? node.position
                : this.localApproach(actor, node, navigation)
        if (
            point !== undefined &&
            this.route.advance(
                actor,
                room,
                { ...node, position: point },
                bounds === undefined ? 36 : 2,
                now
            )
        ) {
            return true
        }
        if (point === undefined || hasNoRoute(actor)) {
            stop(actor)
            this.skip(node, now)
        }
        return false
    }

    private localApproach(
        actor: GameCharacter,
        node: AdventureResourceNode,
        navigation: ReturnType<GameRoom['navigationFor']>
    ) {
        if (
            node.bounds !== undefined &&
            (this.approachPoint === undefined || !actor.hasPath())
        ) {
            this.approachPoint = resourceApproach(
                actor,
                node.bounds,
                navigation
            )
        }
        return this.approachPoint
    }

    private skip(node: AdventureResourceNode, now: number): void {
        this.unreachable.set(node.id, now + retryDelay)
        this.clearWorksite()
    }

    private select(
        actor: GameCharacter,
        room: GameRoom,
        now: number
    ): AdventureResourceNode | undefined {
        for (const [id, retryAt] of this.unreachable) {
            if (now >= retryAt) {
                this.unreachable.delete(id)
            }
        }
        const service = room.adventureForWorkers()
        return service.selectResourceSnapshot(
            (node) =>
                locationOrder.has(node.locationId) &&
                node.kind === 'wood' &&
                node.remaining > 0 &&
                (node.phase === 'ready' || node.phase === undefined) &&
                !this.unreachable.has(node.id)
                    ? sourceCost(actor, node)
                    : Infinity,
            (first, second) =>
                (locationOrder.get(first.locationId) ?? Infinity) -
                (locationOrder.get(second.locationId) ?? Infinity)
        )
    }

    public plant(actor: GameCharacter, room: GameRoom, now: number): boolean {
        const site = this.selected
        if (
            site?.bounds === undefined ||
            site.locationId !== actor.locationId ||
            now < this.nextPlantAt ||
            countInventoryItem(actor.inventory, 'sapling') === 0 ||
            actor.energy < effectiveWorkEnergy(actor, TREE_PLANT_ENERGY)
        ) {
            return false
        }
        const navigation = room.navigationFor(actor)
        if (
            navigation.grid.plantable === undefined ||
            !resourceReachable(actor, site.bounds, navigation)
        ) {
            return false
        }
        const position = plantingPosition(actor, room)
        if (position === undefined) {
            this.nextPlantAt = now + retryDelay
            return false
        }
        return executeWorkerAdventure(
            actor,
            room,
            { type: 'plant_tree', position },
            now
        ).accepted
    }
}

function plantingPosition(
    actor: GameCharacter,
    room: GameRoom
): Vector2 | undefined {
    const service = room.adventureForWorkers()
    const navigation = room.navigationFor(actor)
    const center = navigation.worldToTile(actor.position)
    const offsets = [0, 1, -1, 2, -2, 3, -3]
    const positions = offsets.flatMap((x) =>
        offsets.map((y) =>
            navigation.tileToWorld({ x: center.x + x, y: center.y + y })
        )
    )
    return positions
        .sort(
            (a, b) => distance(actor.position, a) - distance(actor.position, b)
        )
        .find((position) => {
            const check = service.previewPlant(actor, position, navigation)
            return (
                check.available &&
                resourceReachable(actor, check.bounds, navigation) &&
                !occupied(check.bounds, [actor], actor.locationId)
            )
        })
}

function wait(
    actor: GameCharacter,
    now: number,
    reason: 'bag' | 'break' | 'unavailable',
    text: string
): void {
    stop(actor)
    recordWorkerActivity(actor, { reason, text, intent: 'wait' }, now)
}
