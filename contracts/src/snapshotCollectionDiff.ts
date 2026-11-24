import { hasUnsafeSnapshotKeys, snapshotEntityMap } from './snapshotJson'
import type {
    SnapshotCollectionPatch,
    SnapshotEntityId,
    SnapshotJson,
    SnapshotJsonObject,
    SnapshotPatch,
} from './snapshotPatchTypes'

type ObjectDiffer = (
    previous: SnapshotJsonObject,
    next: SnapshotJsonObject
) => SnapshotPatch | undefined

/** null means a non-keyed array, undefined means an unchanged keyed collection. */
export function diffSnapshotCollection(
    previous: SnapshotJson[],
    next: SnapshotJson[],
    diff: ObjectDiffer
): SnapshotCollectionPatch | null | undefined {
    const before = snapshotEntityMap(previous)
    const after = snapshotEntityMap(next)
    if (
        before === undefined ||
        after === undefined ||
        containsOpaqueEntries(before, after)
    ) {
        return null
    }
    const result: SnapshotCollectionPatch = {}
    const removed = [...before.keys()].filter((id) => !after.has(id))
    if (removed.length > 0) {
        result.removed = removed
    }
    for (const [id, value] of after) {
        const old = before.get(id)
        if (old === undefined) {
            ;(result.added ??= []).push(value)
        } else {
            const patch = diff(old, value)
            if (patch !== undefined) {
                ;(result.changed ??= []).push({ id, patch })
            }
        }
    }
    const expected = [
        ...[...before.keys()].filter((id) => after.has(id)),
        ...[...after.keys()].filter((id) => !before.has(id)),
    ]
    const order = [...after.keys()]
    if (!equalIds(expected, order)) {
        result.order = order
    }
    return Object.keys(result).length === 0 ? undefined : result
}

function containsOpaqueEntries(
    before: Map<SnapshotEntityId, SnapshotJsonObject>,
    after: Map<SnapshotEntityId, SnapshotJsonObject>
): boolean {
    return [...before.values(), ...after.values()].some(hasUnsafeSnapshotKeys)
}

function equalIds(
    first: SnapshotEntityId[],
    second: SnapshotEntityId[]
): boolean {
    return (
        first.length === second.length &&
        first.every((id, index) => id === second[index])
    )
}
