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

The playable prototype uses Bun and TypeScript on the backend, Vue and Vite for
accessible UI, and Excalibur for world presentation. `contracts` owns serializable
network/domain shapes. Tiled-generated maps supply content, collision and authored
interaction metadata. Runtime input reaches the authoritative server through the
shared command boundary.

Use the committed dependency versions and compatibility rules in `AGENTS.md`.
The installed Excalibur release is 0.32.0; check its local declarations before
copying examples. Map generation and optional model calls run outside the
simulation tick.

## Architecture Principles

The backend owns positions, movement validation, combat outcomes, inventory,
progression, NPC decisions and world state. Controllers submit intentions;
shared rules validate and resolve them, publish domain events and project
observer-specific snapshots. Clients render those outcomes.

Players, scripted residents, mobs and model-controlled NPCs share `GameCharacter`.
Controller choice does not create a second simulation or grant knowledge,
abilities, speech, consent or ownership. Compose typed capabilities instead of
adding species/class/controller subclass trees. Creature type, appearance,
faction, personality, profession and controller remain independent data.

`GameCharacter.creatureType` uses the shared definitions in
[`contracts/src/creatures.ts`](../contracts/src/creatures.ts). Creature effects and
immunities are explicit gameplay rules; they are not inferred from a sprite or
model prose. World dimensions, names, IDs and adjacency come from
[`contracts/src/world.ts`](../contracts/src/world.ts).

## Current playable scope and knowledge

The current region is the Lands of Novogorod, with a central city and increasingly
dangerous surrounding locations. It includes movement and travel, combat,
inventory and shared containers, resource work, planting and farming, crafting,
finite markets and workshop orders, personal and guild contracts, companionship,
learning, prayer, rescue and permanent death. The bell story supplies an initial
activity alongside residents' own needs.

The [world knowledge corpus](../knowledge/README.md) is the canonical description
of implemented world-facing behaviour. It is organized by topic, with access and
verification metadata. Shared explanations describe possibilities; profession
and doctrine articles add appropriate expertise. Personal discoveries and current
observations remain projections of the actual character and world. See
[playable world](playable-world.md) for controls and operation, and
[character development](character-development.md) for its UI.

An Искра marks an active human connection or accepted model-control lease. An Эхо
follows authored habits or an assigned scenario without either. Both remain the
same visible, vulnerable character under the same rules. Speech is an independent
capability. Current storage is in-memory; a world restart does not preserve this
session's characters, possessions or receipts.

An authored [knowledge grant](npc-ai.md) only makes a passage available to that
character's retrieval. Knowing a lesson does not unlock it for the listener.
Conversation memories are attributed recollections; real inventory, current
contracts, prices, stock and observed positions come from validated projections.
Eligible NPCs use the configured CLI for reasoning when it is available. [NPC reasoning setup](npc-ai.md).

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

## Interface and presentation

Vue owns accessible windows, text, inventory, dialogue, knowledge and party UI.
Canvas owns the map, characters, target highlights and bounded cosmetic effects.
The selected UI target is the target rendered in the world; input ownership and
cleanup prevent focused windows or hidden pages from leaking gameplay controls.

See [hotbar and target focus](playable-world.md#hotbar-target-focus-and-combat-feedback),
[dialogue controls](playable-world.md#speech-bubbles-and-dialogue-keys), and the
[character window and atlas](character-development.md). These controls belong to
the client guide and are not supplied as NPC world knowledge.
