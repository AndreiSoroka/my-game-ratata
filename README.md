# Ash Border

Ash Border is a browser-based multiplayer RPG prototype set in the Lands of Novogorod. Explore 25 locations, gather and craft supplies, trade with townsfolk, and take on quests alone or with a party.

## Run locally

Install Bun 1.4.4 and Node.js 24.12 or newer. Install and sign in to either Codex CLI or Claude Code on the machine running the backend. The game checks the configured model before letting players join. [NPC AI setup](docs/npc-ai.md).

Choose **Русский** or **English** at sign-in or in the game menu. To enable automatic
speech translation, run `bun run translation:prepare` once before starting the
backend. It downloads the pinned RU↔EN models into `.cache/ratata-translation`.
The backend warms them in a local Node process and displays the original speech
while the translation is pending. The translator works independently of the AI
NPC provider. Run `bun run translation:smoke` to check both models and measure warm
latency. Set `GAME_SPEECH_TRANSLATION=0` to disable translation, or
`GAME_TRANSLATION_MODELS` to use a different model cache.

Run the following commands from the repository root.

```sh
bun install --frozen-lockfile
bun run dev:backend
```

In a second terminal, run `bun run dev:frontend` and open [the local game](http://127.0.0.1:5173).

For Wi-Fi play, stop previous launches and run `bun run dev:lan` from the repository
root. It starts the backend on port 3000 and the frontend on port 4173, both on
`0.0.0.0`. Other devices on the same network open `http://<computer-ip>:4173`;
`Ctrl+C` stops both processes. Restarting the backend resets the in-memory world.
The LAN backend runs without a file watcher, so source edits do not restart a
shared game session; restart it explicitly to apply server changes.

Game updates use negotiated WebSocket compression and only include world objects
inside each camera's view plus 15% on every side. Inventory, quests, party and
dialogue data remain available independently of the camera. Slow connections skip
obsolete snapshots while their send queue drains; action results remain reliable.
The map itself is still loaded once per location. HTTPS is not required for these
optimizations.

See the [playable world guide](docs/playable-world.md) for controls and gameplay. Run `bun run check` to verify the project.
