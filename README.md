# Ash Border

Ash Border is a browser-based multiplayer RPG prototype set in the Lands of Novogorod. Explore 25 locations, gather and craft supplies, trade with townsfolk, and take on quests alone or with a party.

## Run locally

Install Bun 1.4.4 and Node.js 24.12 or newer. NPC AI is on by default. Install and sign in to either Codex CLI or Claude Code on the machine running the backend. [NPC AI setup](docs/npc-ai.md).

Run the following commands from the repository root.

```sh
bun install --frozen-lockfile
bun run dev:backend
```

In a second terminal, run `bun run dev:frontend` and open [the local game](http://127.0.0.1:5173).

See the [playable world guide](docs/playable-world.md) for controls and gameplay. Run `bun run check` to verify the project.
