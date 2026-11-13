import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

import { distanceToBounds } from '../ui/interactionTargets'
import type { AgentTarget } from './agentObservation'
import type { RatataTestState } from './testInterface'

export type AgentDestination = Vector2 | { targetKey: string }
export type TravelDirection = 'north' | 'east' | 'south' | 'west'
export interface NavigationOptions {
    timeoutMs?: number
    tolerance?: number
}

export interface NavigationGoal {
    point: Vector2
    bounds?: WorldObjectBounds
    tolerance: number
    candidates: Vector2[]
}

export function navigationGoal(
    state: RatataTestState,
    destination: AgentDestination,
    tolerance?: number,
    targets: AgentTarget[] = []
): NavigationGoal | undefined {
    if (!('targetKey' in destination)) {
        return {
            point: destination,
            tolerance: tolerance ?? tileTolerance(state),
            candidates: [destination],
        }
    }
    const target = targets.find((entry) => entry.key === destination.targetKey)
    if (!target) return undefined
    return {
        point: target.position,
        bounds: target.bounds,
        tolerance: tolerance ?? Math.max(4, target.interactionRange - 8),
        candidates: approachPoints(state, target),
    }
}

export function goalDistance(position: Vector2, goal: NavigationGoal): number {
    return goal.bounds
        ? distanceToBounds(position, goal.bounds)
        : Math.hypot(position.x - goal.point.x, position.y - goal.point.y)
}

export function tileTolerance(state: RatataTestState): number {
    const map = state.location?.map
    return map ? Math.hypot(map.tileWidth, map.tileHeight) / 2 + 1 : 1
}

function approachPoints(state: RatataTestState, target: AgentTarget): Vector2[] {
    if (!target.bounds) return [{ ...target.position }]
    const bounds = target.bounds
    const position = state.player!.position
    const map = state.location!.map
    const margin = Math.min(map.tileWidth, map.tileHeight) / 2
    const x = Math.max(bounds.x, Math.min(position.x, bounds.x + bounds.width))
    const y = Math.max(bounds.y, Math.min(position.y, bounds.y + bounds.height))
    return [
        { x, y: bounds.y - margin },
        { x, y: bounds.y + bounds.height + margin },
        { x: bounds.x - margin, y },
        { x: bounds.x + bounds.width + margin, y },
    ]
        .filter((point) => inMap(point, state))
        .sort(
            (a, b) =>
                Math.hypot(position.x - a.x, position.y - a.y) -
                Math.hypot(position.x - b.x, position.y - b.y)
        )
}

export function inMap(point: Vector2, state: RatataTestState): boolean {
    const map = state.location?.map
    return Boolean(
        map &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.worldWidth &&
        point.y < map.worldHeight
    )
}

export function validateOptions(options: NavigationOptions): void {
    if (
        options.timeoutMs !== undefined &&
        (!Number.isFinite(options.timeoutMs) ||
            options.timeoutMs < 100 ||
            options.timeoutMs > 60_000)
    ) {
        throw new Error('Navigation timeout must be between 100 and 60000 ms')
    }
    if (
        options.tolerance !== undefined &&
        (!Number.isFinite(options.tolerance) || options.tolerance < 0 || options.tolerance > 64)
    ) {
        throw new Error('Navigation tolerance must be between 0 and 64 world pixels')
    }
}

export function validateDestination(destination: AgentDestination): void {
    if (!destination || typeof destination !== 'object') {
        throw new Error('Destination must be a point or an observed targetKey')
    }
    if ('targetKey' in destination) {
        if (typeof destination.targetKey !== 'string' || !destination.targetKey.trim()) {
            throw new Error('Destination targetKey must be a nonempty string')
        }
    } else if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y)) {
        throw new Error('Destination must be a finite point inside the current location')
    }
}
