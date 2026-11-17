import type {
    CompanionOrder,
    CompanionWaitMode,
    Vector2,
} from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import type { CompanionProfile } from './companionProfiles'
import { distance } from './math'

export interface CompanionRuntime {
    anchor: Vector2
    anchorLocation: string
    lastPlanAt: number
    lastReply: string | null
    leaderId: string | null
    metActors: Set<string>
    order: CompanionOrder
    profile: CompanionProfile
    controlRevision?: number
    waitMode?: CompanionWaitMode | undefined
    waitDeparted?: boolean
    waitResumeOrder?: 'follow' | 'idle'
    waitResumeLeaderId?: string | null
}

export function advanceCompanionIntent(
    character: GameCharacter,
    leader: GameCharacter | undefined,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): void {
    if (advanceCompanionWait(character, leader, state, world, now)) {
        return
    }
    if (leader !== undefined && needsCrossing(character, leader, state)) {
        followToLocation(character, leader, state, world, now)
        return
    }
    const target = state.profile.canFight
        ? world.findVisibleTarget(
              character,
              state.profile.stationary ? 64 : 112
          )
        : undefined
    if (target !== undefined && engage(character, target, state, world, now)) {
        return
    }
    if (holdsPosition(state)) {
        character.setMoveInput({ x: 0, y: 0 })
        character.clearPath()
        return
    }
    if (
        leader !== undefined &&
        distance(character.position, leader.position) > 28
    ) {
        planPath(character, leader.position, state, world, now)
        return
    }
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
}

function advanceCompanionWait(
    character: GameCharacter,
    leader: GameCharacter | undefined,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): boolean {
    if (state.order !== 'wait') {
        return false
    }
    state.waitDeparted ||= ownerDeparted(leader, state)
    if (!atWaitAnchor(character, state, world, now)) {
        return true
    }
    const returned = waitOwnerReturned(character, leader, world)
    if (
        state.waitMode === 'until_return' &&
        state.waitDeparted &&
        state.profile.canFollow &&
        returned
    ) {
        state.order = 'follow'
        state.waitMode = undefined
        state.waitDeparted = false
        delete state.waitResumeOrder
        delete state.waitResumeLeaderId
        state.controlRevision = (state.controlRevision ?? 0) + 1
    } else {
        character.setMoveInput({ x: 0, y: 0 })
        character.clearPath()
        return true
    }
    return false
}

function waitOwnerReturned(
    character: GameCharacter,
    leader: GameCharacter | undefined,
    world: CompanionWorld
): boolean {
    return (
        leader?.locationId === character.locationId &&
        (leader.controllerKind !== 'network_player' || leader.connected) &&
        distance(leader.position, character.position) <= 48 &&
        world
            .navigationFor(character)
            .hasLineOfSight(character.position, leader.position)
    )
}

function ownerDeparted(
    leader: GameCharacter | undefined,
    state: CompanionRuntime
): boolean {
    return (
        leader !== undefined &&
        (leader.locationId !== state.anchorLocation ||
            distance(leader.position, state.anchor) > 80)
    )
}
function atWaitAnchor(
    character: GameCharacter,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): boolean {
    if (
        character.locationId !== state.anchorLocation ||
        distance(character.position, state.anchor) <= 1
    ) {
        return true
    }
    planPath(character, state.anchor, state, world, now)
    return false
}

function engage(
    character: GameCharacter,
    target: GameCharacter,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): boolean {
    character.updateFacing({
        x: target.position.x - character.position.x,
        y: target.position.y - character.position.y,
    })
    if (
        isTargetInAttackRange(
            character,
            target,
            world.navigationFor(character).grid.tileWidth
        )
    ) {
        character.setMoveInput({ x: 0, y: 0 })
        character.clearPath()
        world.requestAttack(character, now, target.id)
        return true
    }
    if (state.profile.stationary || state.order === 'guard') {
        return false
    }
    planPath(character, target.position, state, world, now)
    return true
}

function followToLocation(
    character: GameCharacter,
    leader: GameCharacter,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): void {
    const from = /^map-(\d+)-(\d+)$/.exec(character.locationId)
    const to = /^map-(\d+)-(\d+)$/.exec(leader.locationId)
    if (from === null || to === null) {
        return
    }
    const dx = Math.sign(Number(to[1]) - Number(from[1]))
    const dy = dx === 0 ? Math.sign(Number(to[2]) - Number(from[2])) : 0
    const navigation = world.navigationFor(character)
    const { tileWidth, tileHeight, worldWidth, worldHeight } =
        navigation.summary
    const edge = {
        x:
            dx < 0
                ? tileWidth / 2
                : dx > 0
                  ? worldWidth - tileWidth / 2
                  : worldWidth / 2 + tileWidth / 2,
        y:
            dy < 0
                ? tileHeight / 2
                : dy > 0
                  ? worldHeight - tileHeight / 2
                  : worldHeight / 2 + tileHeight / 2,
    }
    if (distance(character.position, edge) <= 1) {
        character.setMoveInput({ x: dx, y: dy })
        return
    }
    planPath(character, edge, state, world, now)
}

function planPath(
    character: GameCharacter,
    target: Vector2,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): void {
    if (character.hasPath() && now - state.lastPlanAt < 300) {
        return
    }
    character.setPath(
        world.navigationFor(character).findPathWorld(character.position, target)
    )
    state.lastPlanAt = now
}

function needsCrossing(
    character: GameCharacter,
    leader: GameCharacter | undefined,
    state: CompanionRuntime
): boolean {
    return (
        leader !== undefined &&
        character.locationId !== leader.locationId &&
        (state.order === 'follow' || state.order === 'help')
    )
}

function holdsPosition(state: CompanionRuntime): boolean {
    return (
        state.profile.stationary ||
        state.order === 'guard' ||
        state.order === 'idle'
    )
}
