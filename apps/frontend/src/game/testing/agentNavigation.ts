import type { Vector2 } from '@my-game-ratata/contracts'

import { agentAvailable, agentMapReady } from './agentAvailability'
import { stopAgentMovement } from './agentMovementStop'
import {
    type AgentDestination,
    goalDistance,
    inMap,
    type NavigationGoal,
    navigationGoal,
    type NavigationOptions,
    tileTolerance,
    type TravelDirection,
    validateDestination,
    validateOptions,
} from './agentNavigationTargets'
import { type AgentObservation, observeGame } from './agentObservation'
import type { RatataTestState, TestCommand } from './testInterface'

export type { AgentDestination, NavigationOptions, TravelDirection } from './agentNavigationTargets'
export interface NavigationResult {
    status:
        | 'arrived'
        | 'blocked'
        | 'timeout'
        | 'cancelled'
        | 'unavailable'
        | 'target_lost'
        | 'location_changed'
    reason: string
    locationId?: string
    position?: Vector2
    elapsedMs: number
}
interface NavigationPort {
    getState: () => RatataTestState
    send: (command: TestCommand) => void
    observe?: () => AgentObservation
}
interface Journey {
    startedAt: number
    deadline: number
    identity: string
    locationId: string
    destination: AgentDestination
    tolerance?: number
    goal: NavigationGoal
    candidate: number
    refined: boolean
    lastPosition: Vector2
    progressedAt: number
    lastTick?: number
    travel?: { locationId: string; axis: Vector2; crossing: boolean }
    resolve: (result: NavigationResult) => void
}

/** A controller over ordinary commands. Arrival measures position, never edits simulation state. */
export function createAgentNavigator(port: NavigationPort) {
    return new AgentNavigator(port)
}

class AgentNavigator {
    private active?: Journey
    private timer?: ReturnType<typeof setTimeout>

    public constructor(private readonly port: NavigationPort) {}

    public navigate(
        destination: AgentDestination,
        options: NavigationOptions = {}
    ): Promise<NavigationResult> {
        validateOptions(options)
        validateDestination(destination)
        const state = this.port.getState()
        if (state.location && !('targetKey' in destination) && !inMap(destination, state)) {
            throw new Error('Destination must be a finite point inside the current location')
        }
        return this.begin(destination, options)
    }

    public travel(
        direction: TravelDirection,
        options: Pick<NavigationOptions, 'timeoutMs'> = {}
    ): Promise<NavigationResult> {
        validateOptions(options)
        if (!['north', 'east', 'south', 'west'].includes(direction)) {
            throw new Error('Travel direction must be north, east, south or west')
        }
        const state = this.port.getState()
        const exit = this.observe(state).exits.find((entry) => entry.direction === direction)
        if (!exit) {
            this.cancel()
            return Promise.resolve(
                this.result('unavailable', 'No adjacent location in this direction', Date.now())
            )
        }
        return this.begin(exit.position, options, {
            locationId: exit.locationId,
            axis: exit.axis,
            crossing: false,
        })
    }

    public cancel(): void {
        if (this.active) this.finish('cancelled', 'Navigation cancelled')
    }

    private begin(
        destination: AgentDestination,
        options: NavigationOptions,
        travel?: Journey['travel']
    ): Promise<NavigationResult> {
        this.cancel()
        const state = this.port.getState()
        const startedAt = Date.now()
        if (!agentAvailable(state) || !agentMapReady(state) || !state.location) {
            return Promise.resolve(this.result('unavailable', 'Player is not available', startedAt))
        }
        const goal = this.goal(state, destination, options.tolerance)
        if (!goal)
            return Promise.resolve(this.result('target_lost', 'Target is not observed', startedAt))
        return new Promise((resolve) => {
            this.active = {
                destination,
                goal,
                travel,
                resolve,
                startedAt,
                deadline: startedAt + (options.timeoutMs ?? 30_000),
                tolerance: options.tolerance,
                identity: state.player!.id,
                locationId: state.location!.id,
                candidate: 0,
                refined: false,
                lastPosition: { ...state.player!.position },
                progressedAt: startedAt,
                lastTick: state.snapshot?.tick,
            }
            this.port.send({ type: 'cancel_control' })
            this.issuePath()
            this.poll()
        })
    }

    private issuePath(): void {
        const journey = this.active
        if (!journey) return
        const target = journey.goal.candidates[journey.candidate]
        if (!target) {
            this.finish('blocked', 'No reachable approach point was observed')
            return
        }
        this.port.send({ type: 'move_to', target: { ...target } })
    }

    private poll(): void {
        const journey = this.active
        if (!journey) return
        const state = this.port.getState()
        if (!agentAvailable(state) || !state.location || state.player!.id !== journey.identity) {
            this.finish('unavailable', 'Player disconnected, died or changed identity')
            return
        }
        if (this.waitForMap(state, journey)) return
        if (state.location!.id !== journey.locationId) {
            this.finish(
                state.location!.id === journey.travel?.locationId ? 'arrived' : 'location_changed',
                'Player entered a different location'
            )
            return
        }
        const goal = this.goal(state, journey.destination, journey.tolerance)
        if (!goal) {
            this.finish('target_lost', 'Target is no longer observed')
            return
        }
        if (Date.now() >= journey.deadline) {
            this.finish('timeout', 'Navigation deadline elapsed')
            return
        }
        this.advance(state, journey, goal)
        if (this.active === journey) this.timer = setTimeout(() => this.poll(), 100)
    }

    private waitForMap(state: RatataTestState, journey: Journey): boolean {
        if (agentMapReady(state)) return false
        if (Date.now() >= journey.deadline) this.finish('timeout', 'Map loading deadline elapsed')
        else this.timer = setTimeout(() => this.poll(), 100)
        return true
    }

    private advance(state: RatataTestState, journey: Journey, goal: NavigationGoal): void {
        const position = state.player!.position
        if (goalDistance(position, goal) <= goal.tolerance) {
            if (!journey.travel) {
                this.finish('arrived', 'Observed position is within the requested tolerance')
                return
            }
            if (!journey.travel.crossing) {
                journey.travel.crossing = true
                journey.progressedAt = Date.now()
                this.port.send({ type: 'move_input', axis: journey.travel.axis })
            }
        }
        const moved =
            Math.hypot(position.x - journey.lastPosition.x, position.y - journey.lastPosition.y) >=
            1
        if (moved) {
            journey.lastPosition = { ...position }
            journey.progressedAt = Date.now()
        }
        if (
            !journey.travel?.crossing &&
            Math.hypot(goal.point.x - journey.goal.point.x, goal.point.y - journey.goal.point.y) >
                tileTolerance(state)
        ) {
            journey.goal = goal
            journey.candidate = 0
            journey.refined = false
            this.issuePath()
        }
        this.refineEndpoint(state, journey)
        if (
            state.snapshot?.tick !== journey.lastTick &&
            Date.now() - journey.progressedAt >= 2_000
        ) {
            this.retryOrFinish(journey)
        }
        journey.lastTick = state.snapshot?.tick
    }

    private retryOrFinish(journey: Journey): void {
        if (!journey.travel?.crossing && journey.candidate + 1 < journey.goal.candidates.length) {
            journey.candidate += 1
            journey.refined = false
            journey.progressedAt = Date.now()
            this.issuePath()
        } else this.finish('blocked', 'Fresh snapshots show no progress toward the destination')
    }

    private refineEndpoint(state: RatataTestState, journey: Journey): void {
        if (journey.refined || journey.travel?.crossing || state.player!.path.length > 0) return
        const target = journey.goal.candidates[journey.candidate]
        if (!target) return
        const position = state.player!.position
        const map = state.location!.map
        if (
            Math.floor(position.x / map.tileWidth) === Math.floor(target.x / map.tileWidth) &&
            Math.floor(position.y / map.tileHeight) === Math.floor(target.y / map.tileHeight)
        ) {
            // A second normal path in the destination tile resolves its exact world point.
            journey.refined = true
            this.issuePath()
        }
    }

    private finish(status: NavigationResult['status'], reason: string): void {
        const journey = this.active
        if (!journey) return
        this.active = undefined
        clearTimeout(this.timer)
        this.timer = undefined
        const state = this.port.getState()
        if (state.player?.id === journey.identity)
            stopAgentMovement(state, this.port.send, !journey.travel?.crossing)
        journey.resolve(this.result(status, reason, journey.startedAt))
    }

    private result(
        status: NavigationResult['status'],
        reason: string,
        startedAt: number
    ): NavigationResult {
        const state = this.port.getState()
        return {
            status,
            reason,
            locationId: state.location?.id,
            position: state.player ? { ...state.player.position } : undefined,
            elapsedMs: Date.now() - startedAt,
        }
    }

    private observe(state: RatataTestState): AgentObservation {
        return this.port.observe?.() ?? observeGame(state)
    }

    private goal(
        state: RatataTestState,
        destination: AgentDestination,
        tolerance?: number
    ): NavigationGoal | undefined {
        return navigationGoal(
            state,
            destination,
            tolerance,
            'targetKey' in destination ? this.observe(state).targets : []
        )
    }
}
