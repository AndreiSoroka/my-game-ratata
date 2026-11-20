import { describe, expect, it } from 'vitest'
import { watch } from 'vue'

import { createPlayerStatusStore, type PlayerStatusResources } from './playerStatus'

describe('player status store', () => {
    it('updates percentages and exact numbers together and drops numbers that cease to be visible', () => {
        const store = createPlayerStatusStore({
            hpPercent: 55,
            manaPercent: 72,
            energyPercent: 34,
            hpCurrent: 11,
            hpMax: 20,
            manaCurrent: 18,
            manaMax: 25,
        })
        const seen: PlayerStatusResources[] = []
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
        const initial = {
            hpPercent: 50,
            manaPercent: 0,
            energyPercent: 100,
            hpCurrent: 5,
            hpMax: 10,
            nickname: 'Игрок',
        }
        const first = createPlayerStatusStore(initial)
        const second = createPlayerStatusStore(initial)
        const next = { hpPercent: 60, manaPercent: 0, energyPercent: 100 }

        first.update(next)
        next.hpPercent = 80
        initial.hpPercent = 0
        initial.hpCurrent = 0

        expect(first.resources.value).toEqual({ hpPercent: 60, manaPercent: 0, energyPercent: 100 })
        expect(second.resources.value).toEqual({
            hpPercent: 50,
            manaPercent: 0,
            energyPercent: 100,
            hpCurrent: 5,
            hpMax: 10,
        })
    })
})
