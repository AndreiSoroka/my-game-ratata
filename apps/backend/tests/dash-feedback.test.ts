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
    it.each(['energy', 'cooldown', 'stun', 'action', 'stance'] as const)(
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
            if (reason === 'stance') {
                player.combat.defensiveStance = true
            }
            const before = player.energy
            const events = handleDashWithFeedback(player, 1000)
            expect(events).toHaveLength(1)
            expect(events[0]).toMatchObject({
                kind: 'notice',
                noticeKind: 'dash_rejected',
                actorId: player.id,
                audienceIds: [player.id],
                text: {
                    energy: 'Не хватает энергии',
                    cooldown: 'Рывок: ещё 2 с.',
                    stun: 'Рывок: оглушение',
                    action: 'Действие выполняется',
                    stance: 'Рывок сейчас недоступен',
                }[reason],
            })
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
        expect(handleDashWithFeedback(player, 1001)[0]).toMatchObject({
            kind: 'notice',
            noticeKind: 'dash_rejected',
            text: 'Рывок: ещё 3 с.',
        })
        expect(player.movement.dashAvailableAt).toBe(
            1000 + MOVEMENT_RULES.dashCooldownMs
        )
    })
})
