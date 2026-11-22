import { describe, expect, it } from 'vitest'
import { watch } from 'vue'

import { createPlayerVitalsStore, type PlayerVitalsResources } from './playerVitals'

describe('player vitals store', () => {
    it('updates percentages and exact numbers together and drops numbers that cease to be visible', () => {
        const store = createPlayerVitalsStore({
            hpPercent: 55,
            manaPercent: 72,
            energyPercent: 34,
            hpCurrent: 11,
            hpMax: 20,
            manaCurrent: 18,
            manaMax: 25,
        })
        const seen: PlayerVitalsResources[] = []
        const stop = watch(store.resources, (resources) => seen.push(resources), { flush: 'sync' })

        const next = {
            hpPercent: 62,
            manaPercent: 27,
            energyPercent: 0,
            energyCurrent: 0,
            energyMax: 0,
        }
        store.update(next)
        expect(seen).toEqual([next])
        store.update({ hpPercent: 62, manaPercent: 27, energyPercent: 0, energyCurrent: 0 })
        expect(store.resources.value).toEqual({ hpPercent: 62, manaPercent: 27, energyPercent: 0 })
        stop()
    })

    it('keeps store instances independent of each other and of mutable inputs', () => {
        const initialSegments = [40, 20, 20, 20]
        const initial = {
            hpPercent: 50,
            manaPercent: 0,
            energyPercent: 100,
            hpSegments: initialSegments,
            nickname: 'Игрок',
        }
        const first = createPlayerVitalsStore(initial)
        const second = createPlayerVitalsStore(initial)
        const next = { hpPercent: 60, manaPercent: 0, energyPercent: 100 }

        first.update(next)
        next.hpPercent = 80
        initial.hpPercent = 0
        initialSegments[0] = 0

        expect(first.resources.value).toEqual({ hpPercent: 60, manaPercent: 0, energyPercent: 100 })
        expect(second.resources.value).toEqual({
            hpPercent: 50,
            manaPercent: 0,
            energyPercent: 100,
            hpSegments: [40, 20, 20, 20],
        })
    })
})
