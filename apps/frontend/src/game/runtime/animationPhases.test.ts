import { expect, it } from 'vitest'

import { characterCatalog } from '../assets/characterCatalog'
import { characterFixture } from '../testing/characterFixture'
import { animationFrame } from './animationFrame'
import { characterFrame } from './characterFrame'

it('uses the authoritative impact and full recovery boundaries for a fast ordinary action', () => {
    const animation = { row: 6, frameCount: 4, frameMs: 100 }
    const snapshot = {
        animation: { action: 'attack' as const, startedAt: 1000, hitAt: 1050, durationMs: 450 },
    }
    expect(animationFrame(animation, 'attack', 1049, snapshot)).toBe(0)
    expect(animationFrame(animation, 'attack', 1050, snapshot)).toBe(1)
    expect(animationFrame(animation, 'attack', 1350, snapshot)).toBe(3)
    expect(animationFrame(animation, 'attack', 1450, snapshot)).toBe(3)
    expect(animationFrame(animation, 'attack', 10000, snapshot)).toBe(3)
})

it('carries server phases through character presentation without changing the main animation for a reaction', () => {
    const actor = characterFixture('hero', {
        animation: { action: 'attack', startedAt: 1000, hitAt: 1500, durationMs: 900 },
    })
    expect(characterFrame(characterCatalog.player, actor, 1499)?.frame).toBe(0)
    expect(characterFrame(characterCatalog.player, actor, 1500)?.frame).toBe(1)
    // A counter is an event overlay; preserving the snapshot preserves the ordinary windup.
    expect(characterFrame(characterCatalog.player, actor, 1500)?.action).toBe('attack')
    expect(actor.animation.startedAt).toBe(1000)
})
