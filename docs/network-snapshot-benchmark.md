# Snapshot network benchmark

Measured 2026-11-24.

Run: `bun scripts/snapshot-network-benchmark.ts` (or `bun run benchmark:snapshots`).

Bun 1.4.4 on macOS arm64; 720 frames at 50 ms (36 logical seconds), elapsed 128.168 s. All 12 cases passed. All idle-timer and walking cases exceeded the 70% rollout gate: **95.986–96.864% fewer compressed bytes**.

## Method

- Isolated in-memory GameRoom with 8 or 50 authorized, viewport-projected actors and 1 or 10 independent socket streams.
- The player joins, moves and attacks through validated ordinary socket commands. Fixture NPCs use the shared GameCharacter and movement/combat rules; authored autonomous controllers are intentionally frozen. The combat target is a real training target, so attacks cannot kill the measurement fixture.
- Idle cases retain changing cooldown timers. Walking moves all fixture actors. Combat starts 36 ordinary attacks per case.
- Calls the production sendSnapshot implementation with deltas enabled/disabled, including all metadata, stream/sequence headers, first full frame and periodic keyframes (2 full frames per delta connection).
- Compressed byte totals include WebSocket framing. Fresh raw DEFLATE level 6 with the SYNC_FLUSH trailer removed matches the configured Bun shared compressor reset. HTTP upgrade, TCP/IP and TLS overhead are excluded.
- Encode timing includes authorized room snapshot generation, viewport projection, JSON detachment and actual per-socket encoding; compressor timing is reported separately in the JSONL artifact. Values are synchronous wall-clock timing distributions, subject to machine load.
- Memory is sampled from one process running both modes, not independently attributed to the two modes. Across cases: heapUsed 33.8–116.2 MB, RSS 151.8–244.9 MB.

| Actors | Observers | Scenario    | Full bytes | Delta bytes |   Saved | Full encode p50/p95 (ms) | Delta encode p50/p95 (ms) |
| -----: | --------: | ----------- | ---------: | ----------: | ------: | -----------------------: | ------------------------: |
|      8 |         1 | idle-timers |  4,909,159 |     154,021 | 96.863% |              0.506/0.917 |                0.66/1.163 |
|      8 |         1 | walking     |  4,894,073 |     192,577 | 96.065% |               0.57/0.992 |               0.734/1.332 |
|      8 |         1 | combat      |  4,987,577 |     172,664 | 96.538% |              0.593/0.976 |               0.778/1.382 |
|      8 |        10 | idle-timers | 49,124,450 |   1,540,305 | 96.864% |               0.515/0.76 |                0.676/0.97 |
|      8 |        10 | walking     | 49,064,248 |   1,926,147 | 96.074% |              0.516/0.699 |               0.678/0.934 |
|      8 |        10 | combat      | 50,004,254 |   1,727,011 | 96.546% |              0.529/0.877 |               0.695/1.265 |
|     50 |         1 | idle-timers |  7,825,824 |     246,126 | 96.855% |              1.301/1.802 |                1.971/2.71 |
|     50 |         1 | walking     |  7,546,947 |     302,964 | 95.986% |              1.319/1.798 |               1.993/2.693 |
|     50 |         1 | combat      |  7,911,033 |     266,057 | 96.637% |               1.29/1.628 |               1.944/2.693 |
|     50 |        10 | idle-timers | 78,355,114 |   2,461,501 | 96.859% |               1.39/2.073 |               2.108/3.081 |
|     50 |        10 | walking     | 76,114,925 |   3,029,703 |  96.02% |               1.305/2.21 |               1.988/3.209 |
|     50 |        10 | combat      | 79,232,447 |   2,660,913 | 96.642% |              1.351/1.963 |               2.042/3.063 |

## Native Bun verification

An ephemeral loopback Bun server using perMessageDeflate: true sent 10 full and 10 delta messages. Every frame negotiated no-context-takeover, set RSV1, inflated independently to the exact JSON message, and matched estimated compressed bytes including the frame header:

| Stream | Native bytes | Estimated bytes |
| ------ | -----------: | --------------: |
| Full   |        68139 |           68139 |
| Delta  |         8559 |            8559 |

Both probe listeners close in finally; no game server is started.

## Codec profiling

On detached real GameRoom walking snapshots, 1,000 warmed diffs improved from 274 to 166 ms (8 actors) and from 1,136 to 783 ms (50 actors) after adding native JSON equality for unchanged arrays and direct unsafe-key checks. The 66 codec tests continued to pass.

Capture a fresh machine-readable report with `bun run benchmark:snapshots > /tmp/ratata-snapshot-benchmark.jsonl`.
