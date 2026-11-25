import {
    type CompanionOrder,
    type CompanionWaitMode,
    type GameEventPayload,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { findStandingApproach } from './characterSpacing'
import { isTargetInAttackRange } from './combat'
import { sightForCompanion, tryCompanionShot } from './companionAbilities'
import {
    advanceCompanionTravel,
    type CompanionTravelLeg,
    planCompanionPath,
} from './companionNavigation'
import type { CompanionProfile } from './companionProfiles'
import { distance } from './math'

export interface CompanionRuntime {
    anchor: Vector2
    anchorLocation: string
    lastPlanAt: number
    lastReply: string | null
    leaderId: string | null
    leaderDeathSequence?: number
    metActors: Set<string>
    followProposals?: Map<string, number>
    refusedFollowing?: Set<string>
    order: CompanionOrder
    profile: CompanionProfile
    controlRevision?: number
    waitMode?: CompanionWaitMode | undefined
    waitDeparted?: boolean
    waitResumeOrder?: 'follow' | 'idle'
    waitResumeLeaderId?: string | null
    regionalLeg?: CompanionTravelLeg
}

export function advanceCompanionIntent(
    character: GameCharacter,
    leader: GameCharacter | undefined,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): GameEventPayload[] {
    if (advanceCompanionWait(character, leader, state, world, now)) {
        return []
    }
    if (leader !== undefined && needsCrossing(character, leader, state)) {
        advanceCompanionTravel(character, leader.locationId, state, world, now)
        return []
    }
    const target = state.profile.canFight
        ? world.findVisibleTarget(
              character,
              sightForCompanion(character, state, world),
              now
          )
        : undefined
    const engagement =
        target === undefined
            ? undefined
            : engage(character, target, state, world, now)
    if (engagement !== undefined) {
        return engagement
    }
    if (holdsPosition(state)) {
        character.setMoveInput({ x: 0, y: 0 })
        character.clearPath()
        return []
    }
    if (
        leader !== undefined &&
        followLeader(character, leader, state, world, now)
    ) {
        return []
    }
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
    return []
}

function followLeader(
    actor: GameCharacter,
    leader: GameCharacter,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): boolean {
    const radius = 28
    const approach = findStandingApproach(
        actor,
        leader,
        world,
        radius,
        now - state.lastPlanAt < 300
    )
    if (approach.kind === 'followingPath') {
        return true
    }
    if (approach.kind !== 'approaching') {
        const outOfRange = distance(actor.position, leader.position) > radius
        if (outOfRange) {
            planCompanionPath(actor, leader.position, state, world, now)
        }
        return outOfRange
    }
    actor.setPath(approach.path)
    state.lastPlanAt = now
    return true
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
    planCompanionPath(character, state.anchor, state, world, now)
    return false
}

function engage(
    character: GameCharacter,
    target: GameCharacter,
    state: CompanionRuntime,
    world: CompanionWorld,
    now: number
): GameEventPayload[] | undefined {
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
        return []
    }
    const shot = tryCompanionShot(character, target, world, now)
    if (shot !== undefined) {
        return shot
    }
    if (state.profile.stationary || state.order === 'guard') {
        return undefined
    }
    planCompanionPath(character, target.position, state, world, now)
    return []
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
