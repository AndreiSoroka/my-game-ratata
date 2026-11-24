import { applySnapshotCollection } from './snapshotCollectionApply'
import {
    cloneSnapshotJson,
    hasSnapshotKey,
    isSnapshotObject,
    setSnapshotKey,
} from './snapshotJson'
import {
    type SnapshotJsonObject,
    SnapshotPatchError,
} from './snapshotPatchTypes'
import { readSnapshotPatch } from './snapshotPatchValidation'

/** Copy only changed paths; any failed operation leaves the published tree untouched. */
export function applySnapshotObject(
    previous: SnapshotJsonObject,
    input: unknown,
    root = false
): SnapshotJsonObject {
    const patch = readSnapshotPatch(input, root)
    const next = { ...previous }
    for (const key of patch.unset) {
        requireExisting(previous, key)
        Reflect.deleteProperty(next, key)
    }
    for (const [key, literal] of Object.entries(patch.set)) {
        const value = cloneSnapshotJson(literal)
        setSnapshotKey(next, key, value)
    }
    for (const [key, nested] of Object.entries(patch.patch)) {
        const current = requireExisting(previous, key)
        if (!isSnapshotObject(current)) {
            throw new SnapshotPatchError(
                'An object patch needs an existing object'
            )
        }
        const value = applySnapshotObject(current, nested)
        setSnapshotKey(next, key, value)
    }
    for (const [key, collection] of Object.entries(patch.collections)) {
        const current = requireExisting(previous, key)
        if (!Array.isArray(current)) {
            throw new SnapshotPatchError(
                'A collection patch needs an existing array'
            )
        }
        const value = applySnapshotCollection(
            current,
            collection,
            applySnapshotObject
        )
        setSnapshotKey(next, key, value)
    }
    return identicalProperties(previous, next) ? previous : next
}

function identicalProperties(
    first: SnapshotJsonObject,
    second: SnapshotJsonObject
): boolean {
    const keys = Object.keys(first)
    return (
        keys.length === Object.keys(second).length &&
        keys.every(
            (key) => hasSnapshotKey(second, key) && first[key] === second[key]
        )
    )
}

function requireExisting(previous: SnapshotJsonObject, key: string) {
    const value = previous[key]
    if (!hasSnapshotKey(previous, key) || value === undefined) {
        throw new SnapshotPatchError('Patch references an absent property')
    }
    return value
}
