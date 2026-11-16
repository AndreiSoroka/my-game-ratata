import { describe, expect, it } from 'vitest'

import { handleAbilityCommand } from '../src/game/abilityCommands'
import { resolveConstellationCardEffects } from '../src/game/constellationCardEffects'
import { constellationWireId } from '../src/game/constellationNodes'
import { syncAbilityConstellations } from '../src/game/constellations'
import { snapshotConstellations } from '../src/game/constellationSnapshot'
import { prepareConstellationLayout } from '../src/game/personalConstellationSky'
import { prayerParameters } from '../src/game/prayerParameters'
import { abilityContext, abilityHero } from './abilityTestHelpers'

describe('published target ranks of both Mother prayer actions', () => {
    it.each([
        [1, 2],
        [2, 5],
        [3, 20],
    ] as const)(
        'publishes rank %s as %s homogeneous or mixed targets in the appropriate card',
        (rank, limit) => {
            const actor = abilityHero()
            const learned = actor.progression.constellations.opened
            for (let value = 1; value <= rank; value += 1) {
                learned.add(`prayer.targets${String(value)}`)
            }
            learned.add('prayer.area')
            syncAbilityConstellations(actor)
            expect(prayerParameters(actor, 24, 'pray').targetLimit).toBe(limit)
            expect(prayerParameters(actor, 24, 'pray_woven').targetLimit).toBe(
                limit
            )
            const ordinary = resolveConstellationCardEffects(
                'prayer.root',
                learned
            )
            expect(ordinary).toContain(
                `За одну молитву совершает один вид чуда: не более ${String(limit)} целей.`
            )
            expect(
                ordinary?.some((line) => line.includes('разные чудеса'))
            ).toBe(false)
            const mixed = resolveConstellationCardEffects(
                'prayer.area',
                learned
            )
            expect(mixed).toContain(
                `Одновременно совершает разные чудеса: не более ${String(limit)} целей за молитву.`
            )
            expect(actor.abilities.known.has('pray_woven')).toBe(true)
        }
    )

    it('keeps the unranked root at one target and does not disclose or grant an unknown Woven star', () => {
        const actor = abilityHero()
        expect(prayerParameters(actor, 24, 'pray').targetLimit).toBe(1)
        expect(
            resolveConstellationCardEffects(
                'prayer.root',
                new Set(['prayer.root'])
            )
        ).toContain('За одну молитву действует на одну выбранную цель.')
        actor.progression.constellations.opened.add('prayer.targets1')
        actor.progression.constellations.opened.add('prayer.targets2')
        actor.progression.constellations.opened.add('prayer.targets3')
        syncAbilityConstellations(actor)
        expect(prayerParameters(actor, 24, 'pray').targetLimit).toBe(20)
        expect(actor.abilities.known.has('pray_woven')).toBe(false)
        prepareConstellationLayout(actor)
        const snapshot = snapshotConstellations(actor)
        const ordinary = snapshot.nodes.find(
            (node) => node.id === constellationWireId('prayer.root')
        )
        expect(ordinary?.effects).toContain(
            'За одну молитву совершает один вид чуда: не более 20 целей.'
        )
        const unknown = snapshot.nodes.find(
            (node) => node.id === constellationWireId('prayer.area')
        )
        expect(unknown).toMatchObject({ unlocked: false })
        for (const field of [
            'effects',
            'effectType',
            'name',
            'description',
            'kind',
        ] as const) {
            expect(unknown?.[field]).toBeUndefined()
        }
        actor.hp -= 1
        const mana = actor.mana
        const events = handleAbilityCommand(
            actor,
            {
                type: 'use_ability',
                abilityId: 'pray_woven',
                intent: { mode: 'restore', targetId: actor.id },
            },
            abilityContext([actor])
        )
        expect(events.some((event) => event.phase === 'started')).toBe(false)
        expect(actor.abilities.casting).toBeNull()
        expect(actor.mana).toBe(mana)
    })
})
