import {
    applySnapshotPatch,
    type ServerMessage,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'

/** Rule assertions consume reconstructed state, while callers retain the original wire frames. */
export function receivedSnapshot(
    messages: readonly ServerMessage[]
): WorldSnapshot {
    let snapshot: WorldSnapshot | undefined
    for (const message of messages) {
        if (message.type === 'world_init' || message.type === 'snapshot') {
            snapshot = message.snapshot
        } else if (message.type === 'snapshot_delta') {
            if (snapshot === undefined) {
                throw new Error('Delta without a test baseline')
            }
            snapshot = applySnapshotPatch(snapshot, message.patch, message)
        }
    }
    if (snapshot === undefined) {
        throw new Error('Expected serialized snapshot')
    }
    return snapshot
}
