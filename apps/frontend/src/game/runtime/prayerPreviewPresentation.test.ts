import { type DeityId, previewPrayerFromSnapshots } from '@my-game-ratata/contracts'
import { expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import { masteriesFixture } from '../testing/masteryFixture'
import { createPrayerPreviewHighlight } from './prayerPreviewPresentation'

function priest(patron: DeityId = 'hearth', level = 3) {
    return characterFixture('caster', {
        health: { kind: 'exact', current: 5, max: 24 },
        position: { x: 100, y: 100 },
        abilities: {
            known: ['pray'],
            cooldowns: {},
            casting: null,
            barrier: null,
            prayer: { radius: 48, durationMs: 3000, manaCost: 5, area: false, harm: level >= 3 },
        },
        progression: {
            masteries: masteriesFixture(),
            deity: {
                id: patron,
                name: '',
                domain: '',
                omen: '',
                perception: 'vague',
                mood: null,
                successChance: null,
                changesInMs: null,
            },
            magicChaptersRead: 0,
            magicChaptersTotal: 3,
            resurrectionUnlocked: true,
        },
    })
}

it('hides harm warnings for a plain prayer even with nearby undead and an ineligible selection', () => {
    const player = priest()
    player.health = { kind: 'exact', current: 24, max: 24 }
    const undead = characterFixture('undead', {
        creatureType: 'undead',
        position: { x: 110, y: 100 },
    })
    const preview = previewPrayerFromSnapshots(player, [undead], player.id)
    expect(preview.intent).toEqual({ mode: 'devotion' })
    expect(preview.harmfulTargets).toBe(0)
    expect(preview.includesAllies).toBe(false)
    expect(preview.includesSelf).toBe(false)
    expect(
        createPrayerPreviewHighlight(player, [undead], preview, {
            active: true,
            canReach: () => true,
        })
    ).toBeUndefined()
    expect(previewPrayerFromSnapshots(player, [undead]).intent).toEqual({ mode: 'harm' })
})

it('uses the shared 48px harm radius and only marks known living reachable allies', () => {
    const player = priest()
    const ally = (id: string, x = 148) =>
        characterFixture(id, {
            creatureType: 'undead',
            relationship: 'friendly',
            position: { x, y: 100 },
        })
    const characters = [
        ally('edge'),
        ally('outside', 148.01),
        ally('wall', 120),
        { ...ally('enemy', 110), relationship: 'hostile' as const },
        { ...ally('dead'), alive: false },
        { ...ally('offline'), tags: ['offline'] },
        { ...ally('retired'), life: { retired: true, reviveUntil: 0, reviveMsLeft: 0 } },
        characterFixture('living', { position: { x: 100, y: 100 } }),
    ]
    const canReach = (target: { id: string }) => target.id !== 'wall'
    const preview = previewPrayerFromSnapshots(player, characters, player.id, { canReach })
    const result = createPrayerPreviewHighlight(player, characters, preview, {
        active: true,
        canReach,
    })
    expect(result).toEqual({
        abilityId: 'pray',
        origin: { x: 100, y: 100 },
        radius: 48,
        targetId: player.id,
        warnings: [{ id: 'edge', position: { x: 148, y: 100 }, self: false }],
    })
    expect(result?.origin).not.toBe(player.position)
})

it('keeps healing waves tied to the healing school when HUD affiliation changes', () => {
    const player = priest('grave')
    const organic = characterFixture('organic', { position: { x: 110, y: 100 } })
    const undead = characterFixture('undead', {
        position: { x: 110, y: 100 },
        creatureType: 'undead',
    })
    const preview = previewPrayerFromSnapshots(player, [organic, undead], player.id)
    const result = createPrayerPreviewHighlight(player, [organic, undead], preview, {
        active: true,
        canReach: () => true,
    })
    expect(result?.warnings.map((warning) => warning.id)).toEqual(['undead'])
})
it.each(['pray_road', 'pray_lantern', 'pray_grave'] as const)(
    'never invents a harmful wave for %s',
    (abilityId) => {
        const player = priest()
        player.abilities!.known.push(abilityId)
        player.abilities!.prayers = {
            [abilityId]: { radius: 48, durationMs: 3000, manaCost: 5, area: false, harm: false },
        }
        const preview = previewPrayerFromSnapshots(player, [], player.id, { abilityId })
        expect(
            createPrayerPreviewHighlight(player, [], preview, {
                active: true,
                canReach: () => true,
            })
        ).toBeUndefined()
    }
)

it('clears preview for an unassigned/blocked prayer, unavailable cast, low skill or lost identity', () => {
    const player = priest()
    const preview = previewPrayerFromSnapshots(player, [], player.id)
    const options = { active: true, canReach: () => true }
    expect(
        createPrayerPreviewHighlight(player, [], preview, { ...options, active: false })
    ).toBeUndefined()
    expect(
        createPrayerPreviewHighlight(
            player,
            [],
            { ...preview, unavailableReason: 'Cooldown' },
            options
        )
    ).toBeUndefined()
    expect(createPrayerPreviewHighlight(priest('hearth', 2), [], preview, options)).toBeUndefined()
    expect(
        createPrayerPreviewHighlight({ ...player, alive: false }, [], preview, options)
    ).toBeUndefined()
    expect(
        createPrayerPreviewHighlight(characterFixture('new-life'), [], preview, options)
    ).toBeUndefined()
})
