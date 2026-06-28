# My Game Ratata: Game Concept

## What We Are Building

My Game Ratata is a new top-down fantasy RPG built from scratch. The older
`my-ai-world-dragonat` project is used only as product and technical context:
no gameplay code, assets, maps, or implementation details are copied into this
repository.

The intended result is a playable client/server RPG prototype where players
move through a 2D world from a top-down camera, interact with NPCs and hostile
creatures, fight in real time, and eventually participate in a deeper world
simulation with character memory, reputation, AI-driven behavior, and shared
domain contracts between frontend and backend.

## Product Direction

The game should feel like a living pixel-art fantasy world rather than a static
combat demo. The first milestones should prioritize a small but coherent loop:

- a player can join the world, move, and see their character on a map;
- the backend is authoritative for gameplay-critical state;
- the frontend renders a responsive top-down scene and HUD;
- NPCs and hostile creatures can exist in the same world model as players;
- combat, health, energy, mana, stun, attack zones, respawn, and chat-like
  messaging are treated as domain systems, not one-off UI behaviors;
- shared contracts define network and gameplay state so frontend and backend
  cannot silently drift apart.

## Technical Direction

The old prototype points to several useful ideas:

- TypeScript everywhere, with strict checking from the beginning.
- A Bun-powered backend for fast local iteration and server runtime.
- A Vue + Vite frontend shell, with Pinia for state, Vitest for unit tests,
  Playwright for e2e tests, ESLint, Prettier, and Vue DevTools.
- A root `contracts` package for shared TypeScript types and protocol shapes.
- A top-down 2D rendering layer can later use a game engine such as Excalibur,
  or another dedicated renderer, inside the frontend app.
- Maps can be authored externally, for example with Tiled, then loaded by the
  game client and interpreted by the backend for collision and pathfinding.
- WebSocket-style realtime transport is the likely fit once gameplay state
  moves beyond health checks.

## Architecture Principles

The backend should be the source of truth for positions, combat results,
inventory, status effects, NPC decisions, and world simulation. Clients should
send intents such as movement, interaction, attack, or ability requests; the
server validates and applies those intents, then publishes snapshots or events.

Characters should not be modeled as separate unrelated classes for players,
network players, NPCs, and scripted actors. They should share one domain model,
with different controllers producing intents:

- local player input;
- remote player network commands;
- NPC AI;
- scripted quest or director logic;
- tests and replay tools.

This keeps combat, effects, resources, pathing, and replication behavior
consistent across players and NPCs.

## Early Domain Concepts

Initial contracts and backend modules should grow around these concepts:

- `PlayerIdentity` and session/connection ownership;
- `WorldPosition`, velocity, facing, and movement intent;
- map collision and navigation/pathfinding;
- `CharacterState` for players and NPCs;
- resources such as hit points, energy, and mana;
- attack zones, cooldowns, damage, stun, death, and respawn;
- chat or speech bubbles as world events;
- NPC state, memory, aggression, flee behavior, and target selection;
- authoritative world snapshots and event streams.

The first implementation should stay small, but the structure should leave room
for richer RPG systems: abilities, effects, tags, factions, reputation, memory,
and story-driven AI.

## Non-Goals For This Skeleton

This repository does not yet contain the old prototype's map, sprites, combat
systems, AI, WebSocket server, or renderer code. The current skeleton is only
the foundation: monorepo layout, strict tooling, Bun backend, Vue frontend, and
shared TypeScript contracts.

## Storybook Game Gallery

The frontend includes a Storybook gallery for inspecting early game visuals in
isolation. The first gallery layer focuses on character sprite sheets rendered
through Excalibur:

- all current character sheets are visible together;
- each character can be inspected by action, direction, and frame;
- frame selection is exposed as a Storybook slider;
- animations can be played in place through Excalibur;
- left-facing variants are rendered by flipping the right-facing frames, matching
  the source sprite-sheet convention.

Only visual reference assets were copied from the old prototype. The old game
runtime, combat UI, HUD implementation, maps, and gameplay code were not ported.
Those interfaces should be rebuilt here from the new contracts and domain model,
then added to Storybook as separate stories once their own components exist.
