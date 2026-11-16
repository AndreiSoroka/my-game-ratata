import { describe, expect, it } from 'vitest'

import { characterFixture, worldFixture } from '../testing/characterFixture'
import { graveFixture } from '../testing/graveFixture'
import { gravePrayerPreview } from './graveInteractions'
import { bindingUnavailable } from './hotbarActions'
import { farmAction } from './nearbyMaterialActions'
import { theftActions } from './theftActions'

function abilityPlayer() {
    return characterFixture('hero', {
        heroClass: 'cleric',
        abilities: { known: ['spark', 'pray'], cooldowns: {}, casting: null, barrier: null },
    })
}

describe('private server resource checks', () => {
    it('uses affordability rather than guessing ability costs from bar fill', () => {
        const player = abilityPlayer()
        const props = { player, characters: [player], blocked: false }
        player.resourceChecks!.abilities.spark = 'mana'
        expect(bindingUnavailable({ kind: 'ability', id: 'spark' }, props, 0, undefined, 0)).toBe(
            'Недостаточно маны'
        )
        player.resourceChecks!.abilities.spark = 'energy'
        expect(bindingUnavailable({ kind: 'ability', id: 'spark' }, props, 0, undefined, 0)).toBe(
            'Недостаточно энергии'
        )
        player.resources = {
            mana: { kind: 'percent', percent: 0, hasCapacity: true },
            energy: { kind: 'percent', percent: 0, hasCapacity: true },
        }
        player.resourceChecks!.abilities.spark = 'ready'
        expect(
            bindingUnavailable({ kind: 'ability', id: 'spark' }, props, 0, undefined, 0)
        ).toBeUndefined()
    })

    it('withholds paid action availability when private checks are missing but keeps basic attacks usable', () => {
        const player = abilityPlayer()
        player.resourceChecks = undefined
        const props = { player, characters: [player], blocked: false }
        expect(
            bindingUnavailable({ kind: 'ability', id: 'spark' }, props, 0, undefined, 0)
        ).toBeTruthy()
        expect(bindingUnavailable({ kind: 'attack' }, props, 0, undefined, 0)).toBeUndefined()
        expect(gravePrayerPreview(player, graveFixture()).unavailableReason).toBeTruthy()
        expect(
            farmAction(
                {
                    id: 'bed',
                    name: 'bed',
                    crop: 'wheat',
                    locationId: 'map-2-2',
                    position: { x: 0, y: 0 },
                    phase: 'bare',
                    readyAt: 0,
                },
                player,
                0
            ).disabled
        ).toBe(true)
        const target = characterFixture('npc', { position: { x: 20, y: 0 } })
        expect(theftActions(worldFixture([player, target]), player, [target])[0]?.disabled).toBe(
            true
        )
    })
})
