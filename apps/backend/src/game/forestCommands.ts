import type { GatherOperation, Vector2 } from '@my-game-ratata/contracts'

export function validResourceId(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.length <= 100
    )
}

export function isGatherOperation(value: unknown): value is GatherOperation {
    return (
        value === 'harvest' ||
        value === 'clear_stump' ||
        value === 'cut_sapling'
    )
}

export function parseGatherAction(
    record: Record<string, unknown>
): { kind: 'gather'; nodeId: string; operation?: GatherOperation } | undefined {
    const { nodeId, operation } = record
    if (
        !validResourceId(nodeId) ||
        (operation !== undefined && !isGatherOperation(operation))
    ) {
        return undefined
    }
    return {
        kind: 'gather',
        nodeId,
        ...(operation === undefined ? {} : { operation }),
    }
}

export function parsePlantAction(
    value: unknown
): { kind: 'plant_tree'; position: Vector2 } | undefined {
    const position = finitePosition(value)
    return position === undefined ? undefined : { kind: 'plant_tree', position }
}

function finitePosition(value: unknown): Vector2 | undefined {
    if (
        value === null ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('x' in value) ||
        !('y' in value)
    ) {
        return undefined
    }
    const { x, y } = value
    return typeof x === 'number' &&
        typeof y === 'number' &&
        Number.isFinite(x) &&
        Number.isFinite(y)
        ? { x, y }
        : undefined
}
