import { diffSnapshotCollection } from './snapshotCollectionDiff'
import {
    hasSnapshotKey,
    hasUnsafeSnapshotKeys,
    isSafeSnapshotKey,
    isSnapshotObject,
    snapshotJsonEqual,
    snapshotMetadataKeys,
} from './snapshotJson'
import {
    type SnapshotCollectionPatch,
    type SnapshotJson,
    type SnapshotJsonObject,
    type SnapshotPatch,
    SnapshotPatchError,
} from './snapshotPatchTypes'

type ValueChange =
    | { kind: 'set'; value: SnapshotJson }
    | { kind: 'patch'; value: SnapshotPatch }
    | { kind: 'collections'; value: SnapshotCollectionPatch }

export function diffSnapshotObject(
    previous: SnapshotJsonObject,
    next: SnapshotJsonObject,
    root = false
): SnapshotPatch | undefined {
    if (hasUnsafeSnapshotKeys(previous) || hasUnsafeSnapshotKeys(next)) {
        throw new SnapshotPatchError('An opaque root requires a full snapshot')
    }
    const result: SnapshotPatch = {}
    const removed = deletedKeys(previous, next, root)
    if (removed.length > 0) {
        result.unset = removed
    }
    for (const [key, value] of Object.entries(next)) {
        if (root && snapshotMetadataKeys.has(key)) {
            continue
        }
        const change = hasSnapshotKey(previous, key)
            ? diffValue(previous[key], value)
            : { kind: 'set' as const, value }
        if (change !== undefined) {
            addChange(result, key, change)
        }
    }
    return Object.keys(result).length === 0 ? undefined : result
}

function deletedKeys(
    previous: SnapshotJsonObject,
    next: SnapshotJsonObject,
    root: boolean
): string[] {
    return Object.keys(previous).filter(
        (key) =>
            (!root || !snapshotMetadataKeys.has(key)) &&
            !hasSnapshotKey(next, key)
    )
}

function diffValue(
    previous: SnapshotJson | undefined,
    next: SnapshotJson
): ValueChange | undefined {
    if (previous === next) {
        return undefined
    }
    if (isSnapshotObject(previous) && isSnapshotObject(next)) {
        return diffObjects(previous, next)
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
        // Normalized snapshots detach server objects every frame. Native JSON
        // comparison skips large unchanged ID graphs without rebuilding maps.
        if (JSON.stringify(previous) === JSON.stringify(next)) {
            return undefined
        }
        const collection = diffSnapshotCollection(
            previous,
            next,
            diffSnapshotObject
        )
        if (collection !== null) {
            return collection === undefined
                ? undefined
                : { kind: 'collections', value: collection }
        }
    }
    return previous !== undefined && snapshotJsonEqual(previous, next)
        ? undefined
        : { kind: 'set', value: next }
}

function diffObjects(
    previous: SnapshotJsonObject,
    next: SnapshotJsonObject
): ValueChange | undefined {
    if (hasUnsafeSnapshotKeys(previous) || hasUnsafeSnapshotKeys(next)) {
        return snapshotJsonEqual(previous, next)
            ? undefined
            : { kind: 'set', value: next }
    }
    const patch = diffSnapshotObject(previous, next)
    return patch === undefined ? undefined : { kind: 'patch', value: patch }
}

function addChange(
    result: SnapshotPatch,
    key: string,
    change: ValueChange
): void {
    if (!isSafeSnapshotKey(key)) {
        throw new SnapshotPatchError('An unsafe property cannot be patched')
    }
    switch (change.kind) {
        case 'set':
            ;(result.set ??= {})[key] = change.value
            break
        case 'patch':
            ;(result.patch ??= {})[key] = change.value
            break
        case 'collections':
            ;(result.collections ??= {})[key] = change.value
    }
}
