import type {
    CharacterAutoAction,
    CharacterControlSnapshot,
    GameEventPayload,
    Vector2,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ControlWorld } from './controlWorld'
import { releaseWorkLock } from './harvestWork'

export type ForestAction = Extract<
    CharacterAutoAction,
    { kind: 'gather' | 'plant_tree' }
>
export interface WorkState {
    action: ForestAction
    locationId: string
    equipment: string
    waiting: 'range' | 'cooldown' | 'action' | null
    lastPlanAt: number
    progressAt: number
    progressPosition: Vector2
    ownsLock: boolean
}
export const work = new WeakMap<GameCharacter, WorkState>()
export function samePendingPlant(
    actor: GameCharacter,
    action: CharacterAutoAction | null,
    world: ControlWorld
): boolean {
    const state = work.get(actor)
    if (
        state?.action.kind !== 'plant_tree' ||
        action?.kind !== 'plant_tree' ||
        state.locationId !== actor.locationId
    ) {
        return false
    }
    const navigation = world.navigationFor(actor)
    const current = navigation.worldToTile(state.action.position)
    const requested = navigation.worldToTile(action.position)
    return current.x === requested.x && current.y === requested.y
}
export function snapshotForestAction(
    actor: GameCharacter
): CharacterControlSnapshot | undefined {
    const state = work.get(actor)
    return state === undefined
        ? undefined
        : {
              mode: 'action',
              targetId:
                  state.action.kind === 'gather' ? state.action.nodeId : null,
              action: structuredClone(state.action),
              waiting: state.waiting,
          }
}
export function clearForestAction(actor: GameCharacter): boolean {
    const state = work.get(actor)
    if (state === undefined) {
        return false
    }
    work.delete(actor)
    actor.interruptWork = undefined
    if (state.ownsLock) {
        releaseWorkLock(actor)
    }
    actor.clearPath()
    actor.setMoveInput({ x: 0, y: 0 })
    return true
}
export function equipmentKey(actor: GameCharacter): string {
    return JSON.stringify(
        Object.entries(actor.equipment).map(([slot, item]) => [
            slot,
            item.instanceId,
        ])
    )
}
export function publishForestEvents(
    world: ControlWorld,
    events: GameEventPayload[]
): void {
    world.publishEvents?.(events)
}
