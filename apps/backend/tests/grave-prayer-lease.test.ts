import { GRAVE_PURIFY_CAST_MS } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import type { CompanionWorld } from '../src/game/agentDecisions'
import { cancelCharacterControl } from '../src/game/characterControl'
import { PolicyController } from '../src/game/companionControllers'
import { CompanionService } from '../src/game/companions'
import type { GameRoom } from '../src/game/room'
import {
    gravePrayerFixture,
    prayerNow as now,
    prayerSource as source,
} from './gravePrayerTestHelpers'

it('expires a model lease normally while its shared 50 second prayer completes before scripted movement resumes', () => {
    const f = gravePrayerFixture(true)
    const service = new CompanionService()
    const world: CompanionWorld = {
        getCharacter: (id) => f.characters.get(id),
        navigationFor: () => f.navigation,
        findVisibleTarget: () => undefined,
        requestAttack: () => undefined,
        requestControl: (actor) => {
            cancelCharacterControl(actor)
            return true
        },
        requestAbility: (actor, message, at) =>
            handleAbilityCommand(actor, message, f.context(at)),
    }
    let fallbackCalls = 0
    const policy = new PolicyController(service, {
        update(actor) {
            fallbackCalls++
            actor.setMoveInput({ x: 1, y: 0 })
        },
    })
    const decision = {
        type: 'use_ability',
        abilityId: 'pray',
        intent: {
            mode: 'purify_grave',
            target: { kind: 'grave', id: source.id },
        },
    }
    expect(service.decide(f.actor, decision, world, now).accepted).toBe(true)
    expect(f.actor.soul.controlSource).toBe('model')
    const room = world as unknown as GameRoom
    policy.update(f.actor, room, now + 4_999)
    expect(f.actor.soul.controlSource).toBe('model')
    policy.update(f.actor, room, now + 5_000)
    expect(f.actor.soul.controlSource).toBe('script')
    expect(f.actor.abilities.casting?.mode).toBe('purify_grave')
    expect(service.decide(f.actor, decision, world, now + 5_001).accepted).toBe(
        false
    )
    policy.update(f.actor, room, now + GRAVE_PURIFY_CAST_MS - 1)
    expect(fallbackCalls).toBe(0)
    expect(f.actor.getMoveInput()).toEqual({ x: 0, y: 0 })
    expect(f.advance(now + GRAVE_PURIFY_CAST_MS)).toContainEqual({
        kind: 'grave_purified',
        actorId: f.actor.id,
        target: { kind: 'grave', id: source.id },
    })
    expect(f.actor.mana).toBe(100)
    policy.update(f.actor, room, now + GRAVE_PURIFY_CAST_MS + 1)
    expect(fallbackCalls).toBe(1)
    expect(f.actor.getMoveInput()).toEqual({ x: 1, y: 0 })
})
