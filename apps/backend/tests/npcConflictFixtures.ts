import { CENTER_LOCATION_ID } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, vi } from 'vitest'

import type { GameCharacter } from '../src/game/character'
import { NavigationService } from '../src/game/navigation'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

export function registerConflictFixture() {
    let room: GameRoom | undefined

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(10_000)
        vi.stubGlobal('Bun', { env: {} })
    })

    afterEach(() => {
        room?.stop()
        room = undefined
        vi.restoreAllMocks()
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    return function setup() {
        const navigation = new NavigationService({
            id: CENTER_LOCATION_ID,
            height: 32,
            width: 32,
            solid: Array<boolean>(32 * 32).fill(false),
            solidLayerNames: [],
            tileHeight: 16,
            tileWidth: 16,
        })
        const game = new GameRoom(navigation)
        room = game
        const player = joinScenarioRoom(game, 'Witness tester')
        const merchant = npc(game, 'npc_merchant_1')
        const guard = npc(game, 'npc_guard_1')
        player.actor.position = { x: 72, y: 80 }
        merchant.position = { x: 80, y: 80 }
        guard.position = { x: 192, y: 80 }
        game.start()
        return {
            game,
            player,
            guard,
            merchant,
            knownBy: (actor: GameCharacter) =>
                game.social.society.history.knownIncidents(
                    actor.id,
                    CENTER_LOCATION_ID
                ),
        }
    }
}

export function npc(game: GameRoom, id: string): GameCharacter {
    const result = game.getCharacter(id)
    if (result === undefined) {
        throw new Error(`Missing conflict fixture ${id}`)
    }
    return result
}
