import {
    type AutomationCommand,
    getWorldLocationDefinition,
    GRID_SIZE,
    REGION_NAME,
    type ScenarioDefinition,
    type WorldSnapshot,
} from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import {
    ScenarioDestinationEditor,
    scenarioTargetKey,
    type ScenarioVisibleTarget,
} from '@/entities/scenarios'
import { ScenarioStepFields } from '@/entities/scenarios'
import { automationFixture } from '@/game/testing/automationFixture'
import { adventureFixture, characterFixture, worldFixture } from '@/game/testing/characterFixture'

import { scenarioVisibleTargets } from '../model/scenarioTargets'
import ScenarioPanel from './ScenarioPanel.vue'

const city = 'map-2-2'
const east = 'map-3-2'
const chestId = 'chest_forest_1'
function chest(locationId: string): ScenarioVisibleTarget {
    return { kind: 'chest', id: chestId, label: 'Сундук', locationId }
}
function snapshotIn(locationId: string): WorldSnapshot {
    const player = characterFixture('self')
    return {
        ...worldFixture([player]),
        location: {
            ...getWorldLocationDefinition(locationId)!,
            columns: GRID_SIZE,
            rows: GRID_SIZE,
            regionName: REGION_NAME,
            map: {
                asset: { url: '/game/map/map1.json', revision: 'fixture' },
                id: locationId,
                width: 96,
                height: 80,
                tileWidth: 16,
                tileHeight: 16,
                worldWidth: 1536,
                worldHeight: 1280,
                solidLayerNames: [],
            },
        },
    }
}

it('includes the observed location in every explicit visible target candidate', () => {
    const snapshot = snapshotIn(city)
    const player = snapshot.characters[0]!
    const enemy = characterFixture('enemy', { relationship: 'hostile', faction: 'monsters' })
    snapshot.adventure = adventureFixture()
    snapshot.adventure.resourceNodes.push({
        id: 'tree',
        locationId: city,
        kind: 'wood',
        position: { x: 10, y: 10 },
        remaining: 8,
    })
    snapshot.chests.push({ id: chestId, itemCount: 1, position: { x: 20, y: 20 }, state: 'closed' })
    snapshot.items.push({ id: 'wood-drop', itemId: 'wood', position: { x: 30, y: 30 } })
    const targets = scenarioVisibleTargets(snapshot, player, [player, enemy], () => true)
    expect(targets.map((entry) => entry.kind)).toEqual(['tree', 'enemy', 'chest', 'item'])
    expect(targets.every((entry) => entry.locationId === city)).toBe(true)
})

it('does not substitute an identically named chest in another location for an explicit go target', async () => {
    const wrapper = mount(ScenarioDestinationEditor, {
        props: {
            modelValue: { kind: 'visible', target: 'chest', targetId: chestId, locationId: city },
            markers: [],
            targets: [chest(east)],
        },
    })
    try {
        const select = wrapper.findAll<HTMLSelectElement>('select')[1]!
        expect(select.element.value).toBe(scenarioTargetKey(chest(city)))
        expect(select.element.selectedOptions[0]?.disabled).toBe(true)
        await select.setValue(scenarioTargetKey(chest(east)))
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
            { kind: 'visible', target: 'chest', targetId: chestId, locationId: east },
        ])
        await wrapper.setProps({
            modelValue: { kind: 'visible', target: 'chest', targetId: chestId, locationId: east },
        })
        await select.setValue('')
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
            { kind: 'visible', target: 'chest' },
        ])
    } finally {
        wrapper.unmount()
    }
})

it('pins explicit deposits by location and removes both fields when nearest is selected', async () => {
    const wrapper = mount(ScenarioStepFields, {
        props: {
            modelValue: {
                id: 'stash',
                kind: 'deposit',
                chestId,
                locationId: city,
                mode: 'acquired',
                itemIds: ['wood'],
            },
            markers: [],
            targets: [chest(east)],
        },
    })
    try {
        const select = wrapper.findAll<HTMLSelectElement>('select')[1]!
        expect(select.element.value).toBe(scenarioTargetKey(chest(city)))
        expect(select.element.selectedOptions[0]?.disabled).toBe(true)
        await select.setValue(scenarioTargetKey(chest(east)))
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
            {
                id: 'stash',
                kind: 'deposit',
                chestId,
                locationId: east,
                mode: 'acquired',
                itemIds: ['wood'],
            },
        ])
        await select.setValue('')
        expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([
            { id: 'stash', kind: 'deposit', mode: 'acquired', itemIds: ['wood'] },
        ])
    } finally {
        wrapper.unmount()
    }
})

it('keeps a saved pinned definition clean after server normalization and a location change', async () => {
    const automation = automationFixture()
    automation.scenarios = [
        {
            id: 'pinned',
            name: 'Перенос',
            repeat: 1,
            sequences: [],
            reactions: [],
            main: [
                { id: 'go', kind: 'go', destination: { kind: 'visible', target: 'chest' } },
                { id: 'stash', kind: 'deposit', mode: 'acquired', itemIds: ['wood'] },
            ],
        },
    ]
    const wrapper = mount(ScenarioPanel, {
        props: { automation, playerId: 'self', available: true, targets: [chest(city)] },
    })
    try {
        await wrapper
            .findAll('.scenario-steps > li')[0]!
            .findAll('select')
            .at(-1)!
            .setValue(scenarioTargetKey(chest(city)))
        await wrapper
            .findAll('.scenario-steps > li')[1]!
            .findAll('select')[1]!
            .setValue(scenarioTargetKey(chest(city)))
        await wrapper
            .findAll('button')
            .find((button) => button.text() === 'Сохранить')!
            .trigger('click')
        const command = wrapper.emitted('command')?.at(-1)?.[0]
        expect(command).toMatchObject({ type: 'scenario_save' })
        const saved = (command as Extract<AutomationCommand, { type: 'scenario_save' }>).scenario
        expect(saved.main).toMatchObject([
            { destination: { targetId: chestId, locationId: city } },
            { chestId, locationId: city },
        ])
        const normalized: ScenarioDefinition = {
            id: saved.id,
            name: saved.name,
            repeat: saved.repeat,
            main: saved.main,
            sequences: saved.sequences,
            reactions: saved.reactions,
        }
        await wrapper.setProps({
            automation: { ...automation, scenarios: [normalized] },
            targets: [chest(east)],
        })
        const start = wrapper.findAll('button').find((button) => button.text() === 'Запустить')!
        expect(start.attributes('disabled')).toBeUndefined()
        expect(wrapper.text()).not.toContain('Сохраните изменения перед запуском.')
        expect(wrapper.text()).toContain('Выбранный сундук сейчас не виден')
    } finally {
        wrapper.unmount()
    }
})
