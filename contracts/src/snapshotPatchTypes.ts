/** The canonical, framework-independent JSON representation used on the wire. */
export type SnapshotJson =
    null | boolean | number | string | SnapshotJson[] | SnapshotJsonObject

export interface SnapshotJsonObject {
    [key: string]: SnapshotJson
}

export type SnapshotEntityId = string | number

export interface SnapshotCollectionPatch {
    added?: SnapshotJsonObject[]
    changed?: Array<{ id: SnapshotEntityId; patch: SnapshotPatch }>
    removed?: SnapshotEntityId[]
    order?: SnapshotEntityId[]
}

export interface SnapshotPatch {
    set?: Record<string, SnapshotJson>
    unset?: string[]
    patch?: Record<string, SnapshotPatch>
    collections?: Record<string, SnapshotCollectionPatch>
}

export interface SnapshotFrameMeta {
    tick: number
    serverTime: number
    stepMs: number
}

export class SnapshotPatchError extends Error {
    public constructor(message: string) {
        super(message)
        this.name = 'SnapshotPatchError'
    }
}
