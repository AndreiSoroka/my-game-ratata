# Network synchronization

Client and server use protocol **0.15.0** and must be updated together. Reload old
clients after restarting the server. The transport remains WebSocket over HTTP
or HTTPS, with negotiated per-message compression; HTTP/3 is not required.

## State frames

The server publishes at up to 20 Hz, after applying observer permissions and the
camera viewport plus 15% margin. Inventory, quests and other permitted personal
state are independent of the camera. Each connection owns a separate, detached
JSON baseline: live simulation objects are never used as the retained baseline.

`world_init` carries `streamId`, `seq: 0`, the map and a complete `snapshot`.
Later `snapshot` frames carry `streamId`, `seq` and a complete `snapshot`.
`snapshot_delta` carries `streamId`, `baseSeq`, `seq`, `tick`, `serverTime`,
`stepMs` and an optional `patch`. Even unchanged state receives this small time
header. Timers currently remain literal changed values rather than client-owned
countdowns.

A patch uses these optional operations:

- `set`: new or replaced fields, including explicit `null`.
- `unset`: removed properties; absence differs from `null`.
- `patch`: nested object changes.
- `collections`: arrays keyed by unique string or safe-integer IDs, with `added`,
  `changed`, `removed` and optional complete `order`. Numeric `1` and string `"1"`
  are different IDs. Other arrays are replaced as a field.

The codec validates all operations before publishing the result. Unsafe object
keys are opaque replacement values, never patch targets. Decoding copies only
changed branches, retains the order of arrays and leaves earlier snapshots
unchanged. Development and opt-in test clients freeze decoded trees. Existing
UI, scenes and the agent interface still receive a complete `WorldSnapshot`.

The server advances the baseline only when the socket accepts the frame,
including acceptance into Bun's send queue. A dropped frame does not consume a
sequence number or a new stream. Queue pressure is checked before constructing
an observer snapshot. Reliable action events retain their existing transport.

A change of character identity, map, world epoch or resumed simulation clock
starts a new stream with a full frame at sequence zero. Stream IDs are distinct
across connections and resets within a server process. Full frames are also
sent for recovery and every 30–35 seconds, staggered across connections. A full
frame replaces a delta when its encoding is smaller. Required full frames remain
pending until accepted.

## Recovery and rollback

On a sequence/base mismatch, malformed delta or regressing same-stream clock,
the client retains its last valid snapshot, suspends continuation and sends
`{ "type": "snapshot_resync" }`. It coalesces requests and retries after three
seconds until a full frame arrives. The server coalesces requests too, responds
at most once per second on normal publication ticks, and reprojects current
permissions and viewport. This command works while a joined character is dead
or an exchange is open. Disconnect and socket replacement clear retry timers.

Set `GAME_SNAPSHOT_DELTAS=0` before starting the backend to send only full frames
within protocol 0.15.0. Compression and viewport filtering remain enabled. The
flag does not restore compatibility with an older client.

## Server movement input timing

Manual direction changes use trusted server receipt time inside each simulation
step. Press, release and reversal commands split that step into ordered movement
segments; a key held for 30 ms contributes 30 ms of movement. Untimed controller
intentions retain their existing whole-step behavior.

Each segment uses the shared collision and movement restrictions. The server
sums actual traveled distance, retains net displacement as `velocity`, and
finalizes resource recovery, wear, noise and other step effects once. A partial
step ending in a manual stop publishes `movement.continuationUntil` at the stop
time, so its nonzero average velocity does not forecast additional movement.

The transient per-character history is consumed once and cleared by route,
control, life, location and forced-movement transitions. Only the room's allocated
step window is integrated, including its 250 ms stall limit. Equal commands and
equal-time changes are coalesced. Overflow beyond 128 changes discards movement
credit for that window and retains the latest input for the next step.

## Manual stop correction

A zero-axis `move_input` can carry a `stopCorrection` request with a unique
`id`, the `streamId` and `seq` of a received snapshot, and the displayed
`position` in map pixels. The server validates the request against its eight
most recent sent snapshots and the same character, life, location and manual
movement episode. The request has a 300 ms lifetime measured by the server.
Invalid requests still release movement. One stop can apply one correction.
The connection retains its 128 most recent results for retries.

The server resolves movement and combat before applying a correction and then
updates interaction areas and publishes the snapshot. It validates the remaining
forward movement budget, the recently traveled path for a return, and collisions.
Both directions spend the full distance from a reserve capped at 4 map pixels.
A new identity starts with a full reserve. The reserve gains unused allowance
for actual simulation windows of manual movement, using the existing 250 ms step
cap, and follows the character through reconnects, travel and resurrection.
Active combat in the same location can disable correction, including an
unfinished attack, a projectile or a combat area.

The owner snapshot carries the request ID and `accepted`, `clamped` or
`rejected` as `stopCorrection`. The ordinary character position gives the
resolved point. On release the client stops continuation immediately, holds the
displayed position for up to 300 ms, then reaches the confirmed position in
100 ms. Repeated stationary frames share that deadline. New movement or a
synchronization, map or life transition cancels the wait. Death and forced
displacements apply immediately.

## Cosmetic movement

`WorldSnapshot.stepMs` is the actual server movement step, from 1 to 250 ms;
initial frames use zero. It is optional only for older local fixtures.
`velocity` is still displacement per step. Presentation divides by `stepMs` to
obtain speed; authoritative movement and the `GameCharacter` model are unchanged.

Every rendered character continues its last confirmed movement for at most
200 ms from the sample's server time, then freezes. Ordinary walking changes to
idle after that limit. There is no prediction of unconfirmed local input. A
bounded server-clock estimate does not rewind on delayed delivery. Stream
changes reset it.

Continuation stops at known solid tiles, map edges, the current path segment and
an optional `movement.continuationUntil` deadline. Dash/lunge deadlines come from
a temporary table populated by the movement branch actually executed that tick.
Stuns, death, offline state and life/stance transitions suppress continuation.
Completed blink events mark the next existing character sample as an immediate
snap; first appearances and large corrections also snap. Small corrections blend
over 100 ms, with a speed-dependent threshold and no extension of the horizon.

The body, attached visuals, name, health, selection, mouse targeting and camera
share one displayed position, updated before the camera each frame. Server reach,
collision, damage, visibility and footsteps continue using confirmed state.
Page hiding/resume, map transitions, removal, resync and disposal clear or hold
presentation tracks. No tracks are created from audio-only observations.

## Verification

Run `bun run check` for formatting, types, lint, unit/script tests and builds.
Headless Chromium network scenarios are manual:

```sh
bun run test:e2e -- e2e/snapshot-deltas.spec.ts e2e/network-motion.spec.ts e2e/viewport-network.spec.ts --project chromium
bun run benchmark:snapshots
```

The benchmark compares full and delta publication for 1/10 observers, 8/50
visible actors, timer-only idle, walking and combat. It counts compressed payloads
and WebSocket headers, includes periodic keyframes, reports CPU distributions and
memory, and verifies Bun's actual compressed wire behavior separately. Default
enablement requires at least 70% reduction for both idle timers and walking.

The [recorded benchmark](network-snapshot-benchmark.md) saved 95.986–96.864% in
idle-timer and walking cases. Encoding adds CPU work; the report includes both
modes and a shared-process memory measurement with its attribution limit.
