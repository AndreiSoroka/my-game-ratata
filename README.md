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

See the [playable world guide](docs/playable-world.md) for controls and gameplay. Run `bun run check` to verify the project.
