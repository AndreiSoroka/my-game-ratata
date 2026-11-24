import {
    type SnapshotEntityId,
    type SnapshotJson,
    type SnapshotJsonObject,
    SnapshotPatchError,
} from './snapshotPatchTypes'

export const snapshotMetadataKeys = new Set(['tick', 'serverTime', 'stepMs'])

export function hasSnapshotKey(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key)
}

export function isSnapshotObject(value: unknown): value is SnapshotJsonObject {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }
    const prototype: unknown = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

export function isSafeSnapshotKey(key: string): boolean {
    return key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

export function hasUnsafeSnapshotKeys(value: SnapshotJsonObject): boolean {
    return Object.keys(value).some((key) => !isSafeSnapshotKey(key))
}

/** Define own data properties: opaque JSON keys never invoke Object.prototype setters. */
export function setSnapshotKey(
    target: SnapshotJsonObject,
    key: string,
    value: SnapshotJson
): void {
    Object.defineProperty(target, key, {
        value,
        configurable: true,
        enumerable: true,
        writable: true,
    })
}

export function isSnapshotId(value: unknown): value is SnapshotEntityId {
    return (
        typeof value === 'string' ||
        (typeof value === 'number' && Number.isSafeInteger(value))
    )
}

export function snapshotEntityMap(
    entries: SnapshotJson[]
): Map<SnapshotEntityId, SnapshotJsonObject> | undefined {
    const indexed = new Map<SnapshotEntityId, SnapshotJsonObject>()
    for (const entry of entries) {
        if (!isSnapshotObject(entry) || !hasSnapshotKey(entry, 'id')) {
            return undefined
        }
        const id = entry['id']
        if (!isSnapshotId(id) || indexed.has(id)) {
            return undefined
        }
        indexed.set(id, entry)
    }
    return indexed
}

/** Validate and detach a literal before publishing it; cycles are never valid JSON. */
export function cloneSnapshotJson(
    value: unknown,
    parents = new Set<object>()
): SnapshotJson {
    if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean'
    ) {
        return value
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }
    if (typeof value !== 'object' || parents.has(value)) {
        throw new SnapshotPatchError('Invalid JSON literal')
    }
    parents.add(value)
    const result = cloneSnapshotContainer(value, parents)
    parents.delete(value)
    return result
}

function cloneSnapshotContainer(
    value: object,
    parents: Set<object>
): SnapshotJson {
    if (Array.isArray(value)) {
        return Array.from(value, (entry: unknown) =>
            cloneSnapshotJson(entry, parents)
        )
    }
    if (!isSnapshotObject(value)) {
        throw new SnapshotPatchError('Invalid JSON object')
    }
    const result: SnapshotJsonObject = {}
    for (const [key, child] of Object.entries(value)) {
        setSnapshotKey(result, key, cloneSnapshotJson(child, parents))
    }
    return result
}

export function snapshotJsonEqual(
    first: SnapshotJson,
    second: SnapshotJson
): boolean {
    if (first === second) {
        return true
    }
    if (Array.isArray(first) && Array.isArray(second)) {
        return (
            first.length === second.length &&
            first.every((entry, index) => {
                const other = second[index]
                return other !== undefined && snapshotJsonEqual(entry, other)
            })
        )
    }
    return (
        isSnapshotObject(first) &&
        isSnapshotObject(second) &&
        snapshotObjectsEqual(first, second)
    )
}

function snapshotObjectsEqual(
    first: SnapshotJsonObject,
    second: SnapshotJsonObject
): boolean {
    const keys = Object.keys(first)
    return (
        keys.length === Object.keys(second).length &&
        keys.every((key) => {
            const value = first[key]
            const other = second[key]
            return (
                value !== undefined &&
                other !== undefined &&
                hasSnapshotKey(second, key) &&
                snapshotJsonEqual(value, other)
            )
        })
    )
}
