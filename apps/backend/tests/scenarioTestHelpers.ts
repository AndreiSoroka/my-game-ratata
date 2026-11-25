import {
    type AbilityClientMessage,
    type AdventureClientMessage,
    type AdventureResourceNode,
    CENTER_LOCATION_ID,
    type CharacterControlCommand,
    type GameEventPayload,
    type ScenarioDefinition,
} from '@my-game-ratata/contracts'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { AdventureService } from '../src/game/adventure'
import { GameCharacter } from '../src/game/character'
import { setCharacterControl } from '../src/game/characterControl'
import { executeContainerCommand } from '../src/game/containerCommands'
import { createItemInstance, equipDirect } from '../src/game/inventory'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'
import { ScenarioService } from '../src/game/scenarios'
import { WorldInventory } from '../src/game/worldInventory'

export function scenarioFixture(
    nodes: AdventureResourceNode[] = [],
    width = 30,
    height = 30
) {
    let now = 1000
    let threat: GameCharacter | undefined
    const navigation = fixtureNavigation(width, height)
    const actor = new GameCharacter({
        id: 'player-1',
        nickname: 'Тест',
        archetype: 'human',
        controllerKind: 'network_player',
        locationId: CENTER_LOCATION_ID,
        spawnPosition: { x: 24, y: 24 },
    })
    equipDirect(actor.equipment, createItemInstance('axe'))
    const characters = new Map([[actor.id, actor]])
    const adventure = new AdventureService({
        now: () => now,
        resourceNodes: nodes,
    })
    const inventory = new WorldInventory(navigation, CENTER_LOCATION_ID)
    const events: GameEventPayload[] = []
    const scenarios = fixtureScenarios(characters)
    const room = fixtureRoom(
        characters,
        navigation,
        adventure,
        inventory,
        events
    )
    return {
        actor,
        characters,
        adventure,
        inventory,
        events,
        scenarios,
        room,
        navigation,
        setThreat(value: GameCharacter | undefined) {
            if (threat !== undefined) {
                characters.delete(threat.id)
            }
            threat = value
            if (value !== undefined) {
                characters.set(value.id, value)
            }
        },
        snapshot: () => scenarios.snapshot(actor, now),
        command: (command: Parameters<ScenarioService['handle']>[1]) =>
            scenarios.handle(actor, command, room, now),
        start(definition: ScenarioDefinition) {
            const saved = scenarios.handle(
                actor,
                { type: 'scenario_save', scenario: definition },
                room,
                now
            )
            if (saved !== null) {
                throw new Error(saved)
            }
            const started = scenarios.handle(
                actor,
                { type: 'scenario_start', scenarioId: definition.id },
                room,
                now
            )
            if (started !== null) {
                throw new Error(started)
            }
        },
        tick(count = 1, held = false) {
            for (let index = 0; index < count; index += 1) {
                now += 50
                adventure.update(now, () => navigation, characters.values())
                scenarios.reconcile(characters, now)
                scenarios.advance(actor, room, now, held)
                advanceCharacter({
                    character: actor,
                    navigation,
                    now,
                    deltaMs: 50,
                })
            }
        },
    }
}
function fixtureRoom(
    characters: Map<string, GameCharacter>,
    navigation: NavigationService,
    adventure: AdventureService,
    inventory: WorldInventory,
    events: GameEventPayload[]
): GameRoom {
    const room = {
        getCharacter: (id: string) => characters.get(id),
        navigationFor: () => navigation,
        adventureForWorkers: () => adventure,
        charactersFor: (character: GameCharacter) =>
            [...characters.values()].filter(
                (other) => other.locationId === character.locationId
            ),
        findVisibleTarget: (
            character: GameCharacter,
            radius: number,
            at: number
        ) =>
            findVisibleTarget(
                characters.values(),
                navigation,
                character,
                radius,
                at
            ),
        requestControl: (
            character: GameCharacter,
            command: CharacterControlCommand,
            at: number
        ): boolean => setCharacterControl(character, command, room, at),
        requestAbility: (
            character: GameCharacter,
            message: AbilityClientMessage,
            at: number
        ) =>
            handleAbilityCommand(character, message, {
                characters: [...characters.values()],
                navigation,
                now: at,
            }),
        scenarioEnvironment: () => ({
            chests: inventory.snapshotChests(),
            items: inventory.snapshotItems(),
        }),
        requestAdventure: (
            character: GameCharacter,
            command: AdventureClientMessage,
            at: number
        ) =>
            adventure.handleResult(
                character,
                command,
                [...characters.values()],
                navigation,
                at
            ),
        publishEvents: (next: GameEventPayload[]) => events.push(...next),
        requestPickup: (character: GameCharacter, id: string, at: number) =>
            inventory.pickupItem(character, id, at),
        chestActions: {
            handleResult: (
                character: GameCharacter,
                message: Parameters<typeof executeContainerCommand>[2],
                at: number
            ) =>
                executeContainerCommand(
                    inventory.containers,
                    character,
                    message,
                    at
                ),
        },
        requestAttack: () => undefined,
    } as unknown as GameRoom
    return room
}

export function definition(
    main: ScenarioDefinition['main']
): ScenarioDefinition {
    return {
        id: 'test',
        name: 'Тестовый сценарий',
        repeat: 1,
        main,
        sequences: [],
        reactions: [],
    }
}
export function treeNode(): AdventureResourceNode {
    return {
        id: 'tree-test',
        kind: 'wood',
        source: 'tree',
        phase: 'ready',
        locationId: CENTER_LOCATION_ID,
        position: { x: 168, y: 160 },
        remaining: 8,
        bounds: { x: 144, y: 128, width: 48, height: 32 },
        collisionBounds: { x: 144, y: 128, width: 48, height: 32 },
        matureBounds: { x: 144, y: 128, width: 48, height: 32 },
    }
}

function fixtureNavigation(width: number, height: number): NavigationService {
    return new NavigationService({
        id: 'scenario-test',
        width,
        height,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(width * height).fill(false),
    })
}

function fixtureScenarios(
    characters: Map<string, GameCharacter>
): ScenarioService {
    return new ScenarioService({
        characters: () => characters.values(),
        canAssign: () => ({ accepted: true, error: null }),
        claim: () => ({ accepted: true, error: null }),
        hasConsent: () => true,
        release: () => undefined,
        capabilities: () => ({ canFight: true, canFollow: true }),
    })
}
