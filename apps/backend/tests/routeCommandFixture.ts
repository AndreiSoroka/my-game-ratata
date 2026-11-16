import type {
    ClientMessage,
    GameEventPayload,
    Vector2,
} from '@my-game-ratata/contracts'
import { vi } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import {
    applyAgentDecision,
    type CompanionWorld,
} from '../src/game/agentDecisions'
import {
    cancelCharacterControl,
    setCharacterControl,
    snapshotControl,
} from '../src/game/characterControl'
import type { ControlWorld } from '../src/game/controlWorld'
import { NavigationService } from '../src/game/navigation'
import { applyPlayerMessage } from '../src/game/playerMessages'
import { WorldInventory } from '../src/game/worldInventory'
import { abilityHero } from './abilityTestHelpers'

export type RouteCommandController = 'player' | 'agent'
export function routeCommandFixture(controller: RouteCommandController) {
    const actor = abilityHero(
        'cleric',
        'humanoid',
        controller === 'player' ? 'network_player' : 'scripted'
    )
    const ally = abilityHero('vanguard')
    actor.position = { x: 40, y: 40 }
    ally.position = { x: 40, y: 48 }
    const navigation = new NavigationService({
        id: actor.locationId,
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
    for (let y = 0; y < 20; y++) {
        navigation.grid.solid[y * 20 + 10] = true
    }
    const events: GameEventPayload[] = []
    const onRouteStart = vi.fn()
    const world: CompanionWorld & ControlWorld = {
        getCharacter: (id) =>
            [actor, ally].find((character) => character.id === id),
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
        navigationFor: () => navigation,
        requestControl: (character, command, now) => {
            onRouteStart()
            return setCharacterControl(character, command, world, now)
        },
    }
    const command = (target: Vector2, append = false) => {
        const message = { type: 'move_to', target, append } as const
        if (controller === 'agent') {
            const result = applyAgentDecision(actor, message, world, 1500)
            events.push(...result.events)
            return result
        }
        applyPlayerMessage({
            player: actor,
            navigation,
            message,
            characters: new Map([
                [actor.id, actor],
                [ally.id, ally],
            ]),
            connections: new Map(),
            worldInventory: new WorldInventory(navigation),
            requestAttack: () => undefined,
            onRouteStart,
            sendEvents: (batch) => events.push(...batch),
        })
        return undefined
    }
    const prayer = () => {
        ally.applyDamage(ally.hp, 500)
        const result = handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray',
                intent: { mode: 'revive', targetId: ally.id },
            },
            {
                now: 1000,
                random: () => 0,
                navigation,
                characters: [actor, ally],
            }
        )
        if (!result.some((event) => event.kind === 'cast')) {
            throw new Error('Expected pending prayer')
        }
    }
    const follow = () =>
        setCharacterControl(
            actor,
            { type: 'follow', targetId: ally.id },
            world,
            1000
        )
    const read = () =>
        structuredClone({
            control: snapshotControl(actor),
            path: actor.remainingPath(),
            cast: actor.abilities.casting,
            lock: actor.actionLockUntil,
            axis: actor.getMoveInput(),
        })
    return {
        actor,
        ally,
        navigation,
        world,
        events,
        command,
        prayer,
        follow,
        read,
        onRouteStart,
        cancel: () => cancelCharacterControl(actor),
    }
}

export function moveCommand(
    target: Vector2,
    append = false
): Extract<ClientMessage, { type: 'move_to' }> {
    return { type: 'move_to', target, append }
}
