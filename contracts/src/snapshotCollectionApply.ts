import {
    cloneSnapshotJson,
    hasSnapshotKey,
    isSnapshotId,
    isSnapshotObject,
    snapshotEntityMap,
} from './snapshotJson'
import {
    type SnapshotEntityId,
    type SnapshotJson,
    type SnapshotJsonObject,
    SnapshotPatchError,
} from './snapshotPatchTypes'
import {
    requireSnapshotArray,
    requireSnapshotObject,
} from './snapshotPatchValidation'

type ObjectApplier = (
    previous: SnapshotJsonObject,
    patch: unknown
) => SnapshotJsonObject

export function applySnapshotCollection(
    previous: SnapshotJson[],
    input: unknown,
    apply: ObjectApplier
): SnapshotJson[] {
    const patch = requireSnapshotObject(input, [
        'added',
        'changed',
        'removed',
        'order',
    ])
    const entries = snapshotEntityMap(previous)
    if (entries === undefined) {
        throw new SnapshotPatchError(
            'The previous collection has no unique ids'
        )
    }
    const used = new Set<SnapshotEntityId>()
    removeEntries(entries, optionalArray(patch, 'removed'), used)
    changeEntries(entries, optionalArray(patch, 'changed'), used, apply)
    addEntries(entries, optionalArray(patch, 'added'), used)
    const ids = hasSnapshotKey(patch, 'order')
        ? readOrder(patch['order'], entries)
        : [...entries.keys()]
    const result = ids.map((id) => {
        const entry = entries.get(id)
        if (entry === undefined) {
            throw new SnapshotPatchError('Missing ordered collection member')
        }
        return entry
    })
    return result.length === previous.length &&
        result.every((entry, index) => entry === previous[index])
        ? previous
        : result
}

function optionalArray(value: SnapshotJsonObject, key: string): unknown[] {
    return hasSnapshotKey(value, key) ? requireSnapshotArray(value[key]) : []
}

function claimId(
    input: unknown,
    used: Set<SnapshotEntityId>
): SnapshotEntityId {
    if (!isSnapshotId(input) || used.has(input)) {
        throw new SnapshotPatchError('Invalid or conflicting entity id')
    }
    used.add(input)
    return input
}

function removeEntries(
    entries: Map<SnapshotEntityId, SnapshotJsonObject>,
    removed: unknown[],
    used: Set<SnapshotEntityId>
): void {
    for (const input of removed) {
        if (!entries.delete(claimId(input, used))) {
            throw new SnapshotPatchError('Cannot remove an unknown entity')
        }
    }
}

function changeEntries(
    entries: Map<SnapshotEntityId, SnapshotJsonObject>,
    changed: unknown[],
    used: Set<SnapshotEntityId>,
    apply: ObjectApplier
): void {
    for (const input of changed) {
        const update = requireSnapshotObject(input, ['id', 'patch'])
        const id = claimId(update['id'], used)
        const before = entries.get(id)
        if (before === undefined) {
            throw new SnapshotPatchError('Cannot change an unknown entity')
        }
        const after = apply(before, update['patch'])
        if (!hasSnapshotKey(after, 'id') || after['id'] !== id) {
            throw new SnapshotPatchError('An entity id cannot change')
        }
        entries.set(id, after)
    }
}

function addEntries(
    entries: Map<SnapshotEntityId, SnapshotJsonObject>,
    added: unknown[],
    used: Set<SnapshotEntityId>
): void {
    for (const input of added) {
        const entry = cloneSnapshotJson(input)
        if (!isSnapshotObject(entry) || !hasSnapshotKey(entry, 'id')) {
            throw new SnapshotPatchError('Invalid added entity')
        }
        const id = claimId(entry['id'], used)
        if (entries.has(id)) {
            throw new SnapshotPatchError('Cannot add an existing entity')
        }
        entries.set(id, entry)
    }
}

function readOrder(
    value: unknown,
    entries: Map<SnapshotEntityId, SnapshotJsonObject>
): SnapshotEntityId[] {
    const order = requireSnapshotArray(value)
    if (
        order.length !== entries.size ||
        !order.every(isSnapshotId) ||
        new Set(order).size !== order.length ||
        order.some((id) => !entries.has(id))
    ) {
        throw new SnapshotPatchError(
            'Order must list every entity exactly once'
        )
    }
    return order
}
