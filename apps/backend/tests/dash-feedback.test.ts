import { MOVEMENT_RULES } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { handleDashWithFeedback } from '../src/game/movementFeedback'

function actor() {
    return new GameCharacter({
        id: 'hero',
        nickname: 'Hero',
        archetype: 'human',
        controllerKind: 'network_player',
        spawnPosition: { x: 100, y: 100 },
    })
}

describe('Space dash feedback', () => {
    it.each(['energy', 'cooldown', 'stun', 'action'] as const)(
        'privately explains %s without charging or starting movement',
        (reason) => {
            const player = actor()
            if (reason === 'energy') {
                player.energy = MOVEMENT_RULES.dashEnergy - 1
            }
            if (reason === 'cooldown') {
                player.movement.dashAvailableAt = 2500
            }
            if (reason === 'stun') {
                player.stunUntil = 2500
            }
            if (reason === 'action') {
                player.lockAction(1000, 500)
            }
            const before = player.energy
            const events = handleDashWithFeedback(player, 1000)
            expect(events).toHaveLength(1)
            expect(events[0]).toMatchObject({
                kind: 'notice',
                actorId: player.id,
                audienceIds: [player.id],
            })
            expect(events[0]?.text).toMatch(
                {
                    energy: /30.*Недостаточно сил/,
                    cooldown: /восстанавливается/,
                    stun: /оглушён/,
                    action: /окончания действия/,
                }[reason]
            )
            expect(player.energy).toBe(before)
            expect(player.movement.dashUntil).toBe(0)
        }
    )

    it('starts an affordable ordinary dash once and explains the immediate retry', () => {
        const player = actor()
        player.energy = MOVEMENT_RULES.dashEnergy
        expect(handleDashWithFeedback(player, 1000)).toEqual([
            { kind: 'dash', actorId: player.id },
        ])
        expect(player.energy).toBe(0)
        expect(player.movement.dashUntil).toBe(
            1000 + MOVEMENT_RULES.dashDurationMs
        )
        expect(handleDashWithFeedback(player, 1001)[0]?.kind).toBe('notice')
        expect(player.movement.dashAvailableAt).toBe(
            1000 + MOVEMENT_RULES.dashCooldownMs
        )
    })
})
