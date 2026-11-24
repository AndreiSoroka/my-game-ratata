import { ABILITY_DEFINITIONS, forwardAbilityAttack, forwardShot } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { characterFixture } from '../testing/characterFixture'
import AbilityKnowledge from './AbilityKnowledge.vue'
import { abilityUsage } from './abilityUsage'
import ActionHotbar from './ActionHotbar.vue'
import { ashCharacterActions, ashHotbarCommand, ashHotbarReason } from './ashActions'

const parameters = {
    pray: { mana: 5, energy: 0, cooldownMs: 2700, range: 64, windupMs: 2700 },
    shot: { mana: 0, energy: 8, cooldownMs: 495, range: 96, windupMs: 185 },
    spark: { mana: 5, energy: 4, cooldownMs: 800, range: 112, windupMs: 200 },
}

function observedPlayer() {
    return characterFixture('observed-abilities', {
        heroClass: 'ranger',
        facing: 'right',
        abilities: {
            known: ['shot', 'sniper_shot', 'pray', 'spark'],
            parameters,
            cooldowns: {},
            casting: null,
            barrier: null,
        },
    })
}

describe('authoritative ability usage metadata', () => {
    it('keeps old fixtures compatible and does not expose damage through the fallback', () => {
        const usage = abilityUsage(characterFixture('legacy'), 'spark')
        expect(usage).toEqual({ mana: 6, energy: 5, cooldownMs: 1200, range: 80, windupMs: 1200 })
        expect(usage).not.toHaveProperty('damage')
        expect(usage).not.toHaveProperty('maxDamage')
        expect(forwardShot({ x: 1, y: 2 }, 'right').endpoint).toEqual({
            x: 1 + ABILITY_DEFINITIONS.shot.range,
            y: 2,
        })
        expect(forwardAbilityAttack({ x: 1, y: 2 }, 'up', 'spark').endpoint).toEqual({
            x: 1,
            y: 2 - ABILITY_DEFINITIONS.spark.range,
        })
    })

    it('shows learned costs and prayer interval from the server in the knowledge rows', () => {
        const player = observedPlayer()
        const wrapper = mount(AbilityKnowledge, { props: { player, characters: [player] } })
        try {
            const rows = wrapper.findAll('li').map((row) => row.text().replace(/\s+/g, ' '))
            expect(rows).toContain('Молитва · 5 MP · 0 EN · 2.7 с')
            expect(rows).toContain('Быстрый выстрел · 0 MP · 8 EN · 0.495 с')
            expect(rows).toContain('Искра · 5 MP · 4 EN · 0.8 с')
            expect(wrapper.find('p').exists()).toBe(false)
        } finally {
            wrapper.unmount()
        }
    })

    it('uses observed shot and spark costs in tooltips/picker and their range in world guides', async () => {
        const player = observedPlayer()
        const wrapper = mount(ActionHotbar, {
            props: { player, characters: [player], blocked: false },
        })
        try {
            expect(wrapper.findAll('.hotbar-slot')[1]!.attributes('aria-description')).toContain(
                '8 EN · прицеливание 0.185 с'
            )
            expect(wrapper.emitted('shotPreviewChange')?.at(-1)?.[0]).toMatchObject({
                origin: { x: 0, y: 0 },
                endpoint: { x: 96, y: 0 },
            })
            await wrapper.vm.edit(3)
            const shot = wrapper
                .findAll('.hotbar-picker button')
                .find((button) => button.text().includes('Быстрый выстрел'))
            expect(shot?.text()).toContain('8 EN')
            const spark = wrapper
                .findAll('.hotbar-picker button')
                .find((button) => button.text().includes('Искра'))
            expect(spark?.text().replace(/\s+/g, ' ')).toContain('5 MP · 4 EN')
            await wrapper.setProps({
                player: {
                    ...player,
                    heroClass: 'arcanist',
                    abilities: { ...player.abilities!, known: ['spark', 'barrier', 'pray'] },
                },
            })
            expect(wrapper.findAll('.hotbar-slot')[1]!.attributes('aria-description')).toContain(
                '5 MP · 4 EN'
            )
            expect(wrapper.emitted('shotPreviewChange')?.at(-1)?.[0]).toMatchObject({
                origin: { x: 0, y: 0 },
                endpoint: { x: 112, y: 0 },
            })
        } finally {
            wrapper.unmount()
        }
    })
    it('shows the server aim duration when Quick Shot has a target', () => {
        const player = observedPlayer()
        const target = characterFixture('enemy', { relationship: 'hostile' })
        const wrapper = mount(ActionHotbar, {
            props: { player, target, characters: [player, target], blocked: false },
        })
        try {
            expect(wrapper.findAll('.hotbar-slot')[1]!.attributes('aria-description')).toBe(
                'Быстрый выстрел · 8 EN · прицеливание 0.185 с'
            )
        } finally {
            wrapper.unmount()
        }
    })

    it('offers taming on an eligible wild skeleton and aims the bolt only at a hostile target', () => {
        const player = observedPlayer()
        player.abilities!.known.push('ash_tame', 'ash_exhaustion')
        const skeleton = characterFixture('wild-skeleton', {
            archetype: 'skeleton',
            relationship: 'hostile',
            ashTameable: true,
            position: { x: 32, y: 0 },
        })
        expect(ashCharacterActions(player, skeleton).map(({ command }) => command)).toEqual([
            { type: 'use_ability', abilityId: 'ash_tame', targetId: skeleton.id },
        ])
        expect(ashHotbarReason('ash_tame', player, skeleton)).toBeUndefined()
        expect(ashHotbarReason('ash_exhaustion', player, skeleton)).toBeUndefined()
        expect(ashHotbarCommand('ash_exhaustion', skeleton)).toEqual({
            type: 'use_ability',
            abilityId: 'ash_exhaustion',
            targetId: skeleton.id,
        })
        expect(
            ashHotbarReason('ash_exhaustion', player, { ...skeleton, relationship: 'friendly' })
        ).toBe('Выберите врага: E')
        expect(
            ashHotbarReason('ash_exhaustion', player, { ...skeleton, position: { x: 100, y: 0 } })
        ).toBe('Цель слишком далеко')
    })
})
