import {
    hasSnapshotKey,
    isSafeSnapshotKey,
    isSnapshotObject,
    snapshotMetadataKeys,
} from './snapshotJson'
import {
    type SnapshotJsonObject,
    SnapshotPatchError,
} from './snapshotPatchTypes'

export interface CheckedSnapshotPatch {
    set: SnapshotJsonObject
    unset: string[]
    patch: SnapshotJsonObject
    collections: SnapshotJsonObject
}

export function requireSnapshotObject(
    value: unknown,
    allowedKeys?: readonly string[]
): SnapshotJsonObject {
    if (
        !isSnapshotObject(value) ||
        (allowedKeys !== undefined &&
            Object.keys(value).some((key) => !allowedKeys.includes(key)))
    ) {
        throw new SnapshotPatchError('Invalid patch object')
    }
    return value
}

export function requireSnapshotArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        throw new SnapshotPatchError('Invalid patch array')
    }
    return value as unknown[]
}

export function readSnapshotPatch(
    input: unknown,
    root: boolean
): CheckedSnapshotPatch {
    const value = requireSnapshotObject(input, [
        'set',
        'unset',
        'patch',
        'collections',
    ])
    const patch: CheckedSnapshotPatch = {
        set: optionalObject(value, 'set'),
        unset: optionalKeys(value),
        patch: optionalObject(value, 'patch'),
        collections: optionalObject(value, 'collections'),
    }
    const keys = [
        ...Object.keys(patch.set),
        ...patch.unset,
        ...Object.keys(patch.patch),
        ...Object.keys(patch.collections),
    ]
    if (
        new Set(keys).size !== keys.length ||
        keys.some(
            (key) =>
                !isSafeSnapshotKey(key) ||
                (root && snapshotMetadataKeys.has(key))
        )
    ) {
        throw new SnapshotPatchError(
            'Unsafe or overlapping property operations'
        )
    }
    return patch
}

function optionalObject(
    value: SnapshotJsonObject,
    key: string
): SnapshotJsonObject {
    return hasSnapshotKey(value, key) ? requireSnapshotObject(value[key]) : {}
}

function optionalKeys(value: SnapshotJsonObject): string[] {
    if (!hasSnapshotKey(value, 'unset')) {
        return []
    }
    const keys = requireSnapshotArray(value['unset'])
    if (keys.some((key) => typeof key !== 'string')) {
        throw new SnapshotPatchError('Invalid removed property')
    }
    return keys as string[]
}
