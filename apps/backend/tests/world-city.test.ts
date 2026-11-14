import type { ServerMessage } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadNavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import type { RoomSocket } from '../src/game/roomMessaging'

afterEach(() => vi.unstubAllGlobals())

describe('city and wilderness initial snapshots', () => {
    it('starts players in a peaceful city and keeps skeletons and slimes outside it', () => {
        vi.stubGlobal('Bun', { env: {} })
        const room = new GameRoom()
        const sent: ServerMessage[] = []
        const socket = {
            send: (payload: string) =>
                sent.push(JSON.parse(payload) as ServerMessage),
        } as unknown as RoomSocket

        room.handleOpen(socket)
        room.handleMessage(
            socket,
            JSON.stringify({ nickname: 'Andrei', type: 'join' })
        )

        const init = sent.find((message) => message.type === 'world_init')
        expect(init).toBeDefined()
        if (init === undefined) {
            throw new Error('world_init was not sent')
        }

        const characters = new Map(
            init.snapshot.characters.map((character) => [
                character.id,
                character,
            ])
        )
        const player = characters.get(init.playerId)
        const girl = characters.get('npc_friendly_girl_1')
        expect(init.snapshot.location?.id).toBe('map-2-2')
        expect(
            init.snapshot.characters.some(
                (character) => character.faction === 'monsters'
            )
        ).toBe(false)
        const wilderness = room.snapshot(Date.now(), 'map-3-2').characters
        const skeleton = wilderness.find(
            (character) => character.id === 'mob_skeleton_1_map-3-2'
        )
        const slime = wilderness.find(
            (character) => character.id === 'mob_slime_1_map-3-2'
        )
        const wildernessNavigation = loadNavigationService('map-3-2')

        if (
            player === undefined ||
            girl === undefined ||
            skeleton === undefined ||
            slime === undefined
        ) {
            throw new Error('Missing city residents or wilderness enemies')
        }
        expect(player.faction).toBe('peaceful')
        expect(player.reputation.monsters).toBe(-100)
        expect(girl.archetype).toBe('human')
        expect(girl.controllerKind).toBe('scripted')
        expect(girl.faction).toBe('peaceful')
        expect(girl.nickname).toBe('Mira')
        expect(girl.visualId).toBe('female_player')
        expect(skeleton.archetype).toBe('skeleton')
        expect(skeleton.faction).toBe('monsters')
        expect(skeleton.health).toEqual({ kind: 'percent', percent: 100 })
        expect(room.getCharacter(skeleton.id)?.maxHp).toBe(44)
        expect(skeleton.resources.maxEnergy).toBe(225)
        expect(slime.archetype).toBe('slime')
        expect(slime.faction).toBe('monsters')
        expect(slime.resources.maxEnergy).toBe(60)

        expect(skeleton).toBeDefined()
        expect(slime).toBeDefined()
        expect(girl).toBeDefined()

        expect(
            room.navigation.isSolidTile(
                room.navigation.worldToTile(girl.position)
            )
        ).toBe(false)
        expect(room.navigation.worldToTile(girl.position)).toEqual({
            x: 40,
            y: 28,
        })
        expect(
            wildernessNavigation.isSolidTile(
                wildernessNavigation.worldToTile(skeleton.position)
            )
        ).toBe(false)
        expect(
            wildernessNavigation.isSolidTile(
                wildernessNavigation.worldToTile(slime.position)
            )
        ).toBe(false)
    })
})
