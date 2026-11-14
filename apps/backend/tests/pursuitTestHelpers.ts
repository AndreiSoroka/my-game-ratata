import {
    type GameEventPayload,
    getWorldLocationDefinition,
    type Vector2,
} from '@my-game-ratata/contracts'

import { GameCharacter } from '../src/game/character'
import { attemptAttack, resolvePendingAttackHit } from '../src/game/combat'
import { Mob1Controller } from '../src/game/controllers'
import { advanceCharacter } from '../src/game/movement'
import { NavigationService } from '../src/game/navigation'
import { rememberPursuitExit } from '../src/game/pursuitTravel'
import { findVisibleTarget } from '../src/game/queries'
import type { GameRoom } from '../src/game/room'
import { WorldLocations } from '../src/game/worldLocations'

export function pursuitFixture(
    options: {
        archetype?: 'skeleton' | 'slime' | 'human'
        locationId?: string
        direction?: Vector2
    } = {}
) {
    const direction = options.direction ?? { x: 1, y: 0 }
    const locationId = options.locationId ?? 'map-1-1'
    const origin = {
        x: direction.x < 0 ? 72 : direction.x > 0 ? 440 : 248,
        y: direction.y < 0 ? 72 : direction.y > 0 ? 440 : 248,
    }
    const actor = new GameCharacter({
        id: options.archetype === 'human' ? 'npc_guard_1' : 'pursuer',
        nickname: 'Pursuer',
        archetype: options.archetype ?? 'skeleton',
        controllerKind: 'mob1',
        faction: options.archetype === 'human' ? 'peaceful' : 'monsters',
        locationId,
        spawnPosition: origin,
    })
    const target = new GameCharacter({
        id: 'target',
        nickname: 'Target',
        archetype: 'human',
        controllerKind: 'network_player',
        locationId,
        spawnPosition: {
            x: origin.x + direction.x * 48,
            y: origin.y + direction.y * 48,
        },
    })
    target.hp = target.maxHp = 10_000
    const navigation = new NavigationService({
        id: 'pursuit-fixture',
        width: 32,
        height: 32,
        tileWidth: 16,
        tileHeight: 16,
        solidLayerNames: [],
        solid: Array<boolean>(1024).fill(false),
    })
    const world = new WorldLocations(navigation)
    const characters = [actor, target]
    const controller = new Mob1Controller(1, { fleeWhenThreatened: false })
    let now = 1_000
    const events: GameEventPayload[] = []
    const context = (
        attacker: GameCharacter,
        at: number,
        targetId?: string
    ) => ({
        actor: attacker,
        now: at,
        targets: characters,
        ...(targetId === undefined ? {} : { targetId }),
        navigation: world.get(attacker.locationId).navigation,
        tileSize: 16,
        random: () => 0.9,
        respawnDelayMsFor: () => 15_000,
    })
    const room = {
        getCharacter: (id: string) =>
            characters.find((character) => character.id === id),
        charactersFor: (character: GameCharacter) =>
            characters.filter(
                (other) => other.locationId === character.locationId
            ),
        navigationFor: (character: GameCharacter) =>
            world.get(character.locationId).navigation,
        findVisibleTarget: (observer: GameCharacter, radius: number) =>
            findVisibleTarget(
                characters,
                world.get(observer.locationId).navigation,
                observer,
                radius,
                now
            ),
        requestScavenge: () => false,
        publishEvents: (next: GameEventPayload[]) => events.push(...next),
        requestAttack: (
            attacker: GameCharacter,
            at: number,
            targetId?: string
        ) => events.push(...attemptAttack(context(attacker, at, targetId))),
    } as unknown as GameRoom
    const move = (character: GameCharacter, deltaMs: number) =>
        movePursuitCharacter(character, characters, world, now, deltaMs)
    const step = (
        decide = () => controller.update(actor, room, now),
        deltaMs = 50
    ) => {
        now += deltaMs
        decide()
        for (const character of characters) {
            move(character, deltaMs)
        }
        for (const character of characters) {
            events.push(...resolvePendingAttackHit(context(character, now)))
        }
    }
    return {
        actor,
        target,
        direction,
        world,
        room,
        characters,
        events,
        controller,
        step,
        now: () => now,
        move,
    }
}

function movePursuitCharacter(
    character: GameCharacter,
    characters: GameCharacter[],
    world: WorldLocations,
    now: number,
    deltaMs: number
): void {
    const from = character.locationId
    const nav = world.get(from).navigation
    const point = character.nextPathPoint()
    const input = character.getMoveInput()
    const intent =
        input.x !== 0 || input.y !== 0 || point === undefined
            ? input
            : {
                  x: point.x - character.position.x,
                  y: point.y - character.position.y,
              }
    advanceCharacter({ character, navigation: nav, now, deltaMs })
    const edge = { ...character.position }
    world.travel(character, intent, now)
    const previous = getWorldLocationDefinition(from),
        next = getWorldLocationDefinition(character.locationId)
    if (
        from !== character.locationId &&
        previous !== undefined &&
        next !== undefined
    ) {
        rememberPursuitExit(
            character,
            from,
            edge,
            {
                x: next.column - previous.column,
                y: next.row - previous.row,
            },
            characters,
            nav,
            now
        )
    }
}
