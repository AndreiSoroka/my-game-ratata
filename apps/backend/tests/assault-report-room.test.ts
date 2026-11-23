import { afterEach, expect, it, vi } from 'vitest'

import { NavigationService } from '../src/game/navigation'
import { grantPersonalHostility } from '../src/game/personalHostility'
import { GameRoom } from '../src/game/room'
import { joinScenarioRoom } from './scenarioRoomHelpers'

let room: GameRoom | undefined

afterEach(() => {
    room?.stop()
    room = undefined
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

it('lets the player who saw their verified assault file a private formal complaint', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.stubGlobal('Bun', { env: {} })
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const game = new GameRoom(
        new NavigationService({
            id: 'assault-report',
            width: 32,
            height: 32,
            tileWidth: 16,
            tileHeight: 16,
            solidLayerNames: [],
            solid: Array<boolean>(32 * 32).fill(false),
        })
    )
    room = game
    game.start()
    const victim = joinScenarioRoom(game, 'Victim')
    const witness = joinScenarioRoom(game, 'Witness')
    const attacker = game.getCharacter('npc_veteran_1')
    const guard = game.getCharacter('npc_guard_1')
    if (attacker === undefined || guard === undefined) {
        throw new Error('Missing attacker or guard')
    }
    victim.actor.position = { x: 96, y: 96 }
    witness.actor.position = { x: 112, y: 112 }
    attacker.position = { x: 88, y: 96 }
    guard.position = { x: 96, y: 128 }
    grantPersonalHostility(attacker, victim.actor, 'test-threat', 10_000)
    expect(
        game.decideForAgent(attacker.id, {
            type: 'attack',
            targetId: victim.actor.id,
        })
    ).toMatchObject({ accepted: true, error: null })
    vi.advanceTimersByTime(1_000)
    expect(
        victim.sent
            .filter((message) => message.type === 'event')
            .map((message) => message.event)
            .filter((event) => event.actorId === attacker.id)
    ).toContainEqual(
        expect.objectContaining({ kind: 'damage', targetId: victim.actor.id })
    )

    const accusations = (viewerId: string) =>
        game
            .snapshot(game.gameplayNow(), victim.actor.locationId, viewerId)
            .characters.find((entry) => entry.id === victim.actor.id)?.theft
            ?.accusations
    expect(accusations(victim.actor.id)).toMatchObject([
        {
            thiefId: attacker.id,
            offense: 'attack',
            canCallGuards: false,
            reported: false,
        },
    ])
    expect(accusations(witness.actor.id)).toEqual([])
    const report = { type: 'report_theft' as const, targetId: attacker.id }
    witness.send(report)
    expect(attacker.tags.has('city.blacklisted')).toBe(false)

    victim.send(report)
    expect(attacker.tags.has('city.blacklisted')).toBe(true)
    expect(accusations(victim.actor.id)).toMatchObject([
        { thiefId: attacker.id, offense: 'attack', reported: true },
    ])
})
