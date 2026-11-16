import {
    type ClientMessage,
    parseMasteryExperience,
    type ServerMessage,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createItemInstance } from '../src/game/inventory'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

function fixture() {
    vi.stubGlobal('Bun', { env: {} })
    const navigation = new NavigationService({
        id: 'privacy-test',
        width: 20,
        height: 20,
        tileWidth: 16,
        tileHeight: 16,
        solid: new Array<boolean>(400).fill(false),
        solidLayerNames: [],
    })
    const room = new GameRoom(navigation)
    const join = (nickname: string) => {
        const sent: ServerMessage[] = []
        const socket = {
            send: (payload: string) =>
                sent.push(JSON.parse(payload) as ServerMessage),
        } as unknown as RoomSocket
        const send = (message: ClientMessage) =>
            room.handleMessage(socket, JSON.stringify(message))
        room.handleOpen(socket)
        send({ type: 'join', nickname })
        const init = sent.find((message) => message.type === 'world_init')
        const character = room.getCharacter(init?.playerId ?? '')
        if (character === undefined) {
            throw new Error('Missing joined hero')
        }
        return { sent, character, send, socket }
    }
    const thief = join('thief')
    const victim = join('victim')
    const observer = join('observer')
    thief.character.position = { x: 100, y: 100 }
    victim.character.position = { x: 112, y: 100 }
    victim.character.inventory.push(createItemInstance('food'))
    thief.send({ type: 'movement_mode', mode: 'sneaking' })
    for (const connection of [thief, victim, observer]) {
        connection.sent.length = 0
    }
    return { room, thief, victim, observer }
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('unnoticed theft privacy through real room sockets', () => {
    it('sends result and skill-up only to the thief, strips recipient metadata, and hides others inventories/results', () => {
        const { room, thief, victim, observer } = fixture()
        const item = victim.character.inventory[0]
        thief.character.progression.masteries.shadow.experience =
            parseMasteryExperience('99')
        vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0.99)
            .mockReturnValueOnce(0)
        thief.send({ type: 'steal', targetId: victim.character.id })
        expect(thief.character.inventory).toEqual([item])
        expect(
            thief.sent.some(
                (message) =>
                    message.type === 'event' &&
                    message.event.kind === 'skill_up'
            )
        ).toBe(true)
        expect(
            thief.sent.every(
                (message) =>
                    message.type !== 'event' ||
                    message.event.audienceIds === undefined
            )
        ).toBe(true)
        expect(victim.sent).toEqual([])
        expect(observer.sent).toEqual([])
        const thiefView = room.snapshot(
            Date.now(),
            thief.character.locationId,
            thief.character.id
        )
        expect(
            thiefView.characters.find(
                (character) => character.id === thief.character.id
            )?.inventory
        ).toEqual([item])
        expect(
            thiefView.characters.find(
                (character) => character.id === thief.character.id
            )?.theft?.lastResult?.outcome
        ).toBe('stolen')
        const publicView = room.snapshot(
            Date.now(),
            thief.character.locationId,
            observer.character.id
        )
        expect(
            publicView.characters.find(
                (character) => character.id === thief.character.id
            )?.inventory
        ).toEqual([])
        expect(
            publicView.characters.find(
                (character) => character.id === thief.character.id
            )?.theft
        ).toMatchObject({
            lastResult: null,
            cooldownMsLeft: 0,
            accusations: [],
        })
        expect(
            publicView.characters.find(
                (character) => character.id === victim.character.id
            )?.inventory
        ).toEqual([])
    })
    it('reveals a caught attempt to its human victim only and cannot forge a guard accusation', () => {
        const { room, thief, victim, observer } = fixture()
        vi.spyOn(Math, 'random').mockReturnValue(0)
        thief.send({ type: 'steal', targetId: victim.character.id })
        expect(
            victim.sent.some(
                (message) =>
                    message.type === 'event' &&
                    (message.event.text?.includes('пытался обокрасть') ?? false)
            )
        ).toBe(true)
        expect(observer.sent).toEqual([])
        const victimView = room.snapshot(
            Date.now(),
            victim.character.locationId,
            victim.character.id
        )
        expect(
            victimView.characters.find(
                (character) => character.id === victim.character.id
            )?.theft?.accusations[0]?.thiefId
        ).toBe(thief.character.id)
        observer.send({ type: 'call_guards', targetId: thief.character.id })
        expect(
            observer.sent.some(
                (message) =>
                    message.type === 'event' &&
                    (message.event.text?.includes('Нет свежего') ?? false)
            )
        ).toBe(true)
        expect(
            room
                .snapshot(
                    Date.now(),
                    thief.character.locationId,
                    thief.character.id
                )
                .characters.find(
                    (character) => character.id === thief.character.id
                )?.theft?.wantedMsLeft
        ).toBe(0)
    })
})

describe('theft agent control boundary', () => {
    it('provides the same rule service to an agent without permitting a human takeover', () => {
        const { room, thief } = fixture()
        const npc = room.getCharacter('npc_veteran_1')
        const target = room.getCharacter('npc_merchant_1')
        if (npc === undefined || target === undefined) {
            throw new Error('Missing city NPCs')
        }
        npc.position = { ...target.position }
        const item = target.inventory[0]
        const before = npc.inventory.length
        expect(
            room.decideForAgent(npc.id, {
                type: 'movement_mode',
                mode: 'sneaking',
            }).accepted
        ).toBe(true)
        vi.spyOn(Math, 'random')
            .mockReturnValueOnce(0.99)
            .mockReturnValueOnce(0)
        expect(
            room.decideForAgent(npc.id, { type: 'steal', targetId: target.id })
                .accepted
        ).toBe(true)
        expect(npc.inventory).toHaveLength(before + 1)
        expect(npc.inventory).toContain(item)
        expect(target.inventory).not.toContain(item)
        expect(
            room.decideForAgent(thief.character.id, {
                type: 'steal',
                targetId: target.id,
            }).accepted
        ).toBe(false)
    })
})

describe('pending skill practice stays private in room snapshots', () => {
    it.each(['stolen', 'failed'] as const)(
        'cannot reveal an unnoticed %s result through practice or branch metadata',
        (outcome) => {
            const { room, thief, victim, observer } = fixture()
            const masteries = thief.character.progression.masteries
            thief.character.abilities.known.add('fireball')
            masteries.magic.level = 3
            masteries.blade.experience = parseMasteryExperience('1')
            const progression = (viewerId: string) =>
                room
                    .snapshot(1_000, thief.character.locationId, viewerId)
                    .characters.find(
                        (character) => character.id === thief.character.id
                    )?.progression
            const before = progression(observer.character.id)
            vi.spyOn(Math, 'random')
                .mockReturnValueOnce(0.99)
                .mockReturnValueOnce(outcome === 'stolen' ? 0 : 0.99)
            thief.send({ type: 'steal', targetId: victim.character.id })
            const owner = progression(thief.character.id)
            const ownShadow = owner?.masteries.find(
                (mastery) => mastery.id === 'shadow'
            )
            if (outcome === 'failed') {
                expect(ownShadow?.experience).toBe('0')
            }
            if (outcome === 'stolen') {
                expect(Number(ownShadow?.experience)).toBeGreaterThan(0)
            }
            for (const viewerId of [
                victim.character.id,
                observer.character.id,
            ]) {
                const otherView = progression(viewerId)
                expect(otherView).toEqual(before)
                expect(
                    otherView?.masteries.every(
                        (mastery) =>
                            mastery.experience === '0' &&
                            mastery.pendingOpenings === 0
                    )
                ).toBe(true)
                expect(
                    otherView?.masteries.find(
                        (mastery) => mastery.id === 'magic'
                    )?.level
                ).toBe(3)
            }
            expect(masteries.shadow.experience > 0n).toBe(outcome === 'stolen')
            expect(Number(ownShadow?.experienceToNext)).toBeGreaterThan(0)
        }
    )
})
