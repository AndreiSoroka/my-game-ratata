import {
    canAcceptInventoryItem,
    CHEST_INTERACTION_RANGE,
    chestInteractionDistance,
    type GameEventPayload,
    type Vector2,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { canPerformSkillAction } from './skillProgression'
import type { WorldInventory } from './worldInventory'
import type { WorldLocations } from './worldLocations'

interface ScavengeState {
    nextPlan: number
    pursuing: boolean
    bag: string
    ignored: Set<string>
}
const states = new WeakMap<GameCharacter, ScavengeState>()

/** Called only after combat and investigation policies have yielded. */
export function scavenge(
    actor: GameCharacter,
    inventory: WorldInventory,
    navigation: NavigationService,
    now: number,
    publish: (events: GameEventPayload[]) => void
): boolean {
    if (!canPerformSkillAction(actor, now)) {
        return false
    }
    const state = stateFor(actor)
    if (now < state.nextPlan) {
        return state.pursuing && actor.hasPath()
    }
    state.nextPlan = now + 500
    state.pursuing = false
    const candidates = visibleLoot(actor, inventory, navigation, state)
    for (const target of candidates) {
        const reached = target.corpse
            ? chestInteractionDistance(actor.position, target.position) <=
              CHEST_INTERACTION_RANGE
            : distance(actor.position, target.position) <= 24
        if (reached) {
            actor.clearPath()
            collect(actor, target, inventory, now, publish)
            if (target.corpse) {
                state.ignored.add(target.id)
            }
            state.nextPlan = now + 2_000
            return true
        }
        const path = navigation.findPathWorld(actor.position, target.position)
        if (path.length === 0) {
            continue
        }
        actor.setPath(path)
        state.pursuing = true
        return true
    }
    return false
}

function stateFor(actor: GameCharacter): ScavengeState {
    const state = states.get(actor) ?? {
        nextPlan: 0,
        pursuing: false,
        bag: '',
        ignored: new Set<string>(),
    }
    const bag = actor.inventory
        .map((item) => `${item.instanceId}:${String(item.quantity ?? 1)}`)
        .join('|')
    if (state.bag !== bag) {
        state.ignored.clear()
        state.bag = bag
    }
    states.set(actor, state)
    return state
}

function collect(
    actor: GameCharacter,
    target: { id: string; corpse: boolean },
    inventory: WorldInventory,
    now: number,
    publish: (events: GameEventPayload[]) => void
): void {
    if (!target.corpse) {
        publish(inventory.pickupItem(actor, target.id, now))
        return
    }
    publish(inventory.openChestById(actor, target.id, now))
    publish(
        inventory.containers.handle(
            actor,
            { type: 'take_all_chest_items', chestId: target.id },
            now
        )
    )
    inventory.containers.close(actor.id)
}

function visibleLoot(
    actor: GameCharacter,
    inventory: WorldInventory,
    navigation: NavigationService,
    state: ScavengeState
) {
    const items = inventory.snapshotItems().filter((item) =>
        canAcceptInventoryItem(actor.inventory, {
            ...item,
            instanceId: item.id,
        })
    )
    const corpses = inventory
        .snapshotChests()
        .filter(
            (container) =>
                container.kind === 'corpse' &&
                !state.ignored.has(container.id) &&
                !inventory.corpseAwaitingReturn(container.id)
        )
    return [
        ...items.map((item) => ({
            id: item.id,
            position: item.position,
            corpse: false,
        })),
        ...corpses.map((corpse) => ({
            id: corpse.id,
            position: corpse.position,
            corpse: true,
        })),
    ]
        .filter((target) => visible(actor, target.position, navigation))
        .sort(
            (a, b) =>
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
        )
}

function visible(
    actor: GameCharacter,
    point: Vector2,
    navigation: NavigationService
): boolean {
    return (
        distance(actor.position, point) <=
            WILDERNESS_AGGRO_POLICY.sightRadius &&
        navigation.hasLineOfSight(actor.position, point)
    )
}

export function createRoomScavenger(
    world: () => WorldLocations,
    publish: (events: GameEventPayload[]) => void
) {
    return (actor: GameCharacter, now: number): boolean => {
        const location = world().get(actor.locationId)
        return scavenge(
            actor,
            location.inventory,
            location.navigation,
            now,
            publish
        )
    }
}
