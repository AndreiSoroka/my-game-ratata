import type { AutomationCommand, ScenarioStep } from '@my-game-ratata/contracts'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

import type { RatataGame } from '@/game/runtime/ratataGame'
import { automationFixture, scenarioRunFixture } from '@/game/testing/automationFixture'
import { characterFixture, worldFixture } from '@/game/testing/characterFixture'

import AutomationPanels from './AutomationPanels.vue'
import MarkerPanel from './MarkerPanel.vue'
import ScenarioPanel from './ScenarioPanel.vue'

const wrappers: { unmount: () => void }[] = []
afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

it('creates current-position markers without sending client coordinates and updates explicit IDs', async () => {
    const markers = automationFixture().markers
    const wrapper = mount(MarkerPanel, {
        props: { markers, available: true },
        attachTo: document.body,
    })
    wrappers.push(wrapper)
    await wrapper.get('form input').setValue('Лес')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('create')).toEqual([['Лес']])
    await wrapper.get('.marker-list input').setValue('Новая опушка')
    await wrapper.get('[aria-label="Переименовать метку 1"]').trigger('click')
    await wrapper.get('[aria-label="Удалить метку 2"]').trigger('click')
    expect(wrapper.emitted('rename')).toEqual([['marker-1', 'Новая опушка']])
    expect(wrapper.emitted('delete')).toEqual([['marker-2']])
    expect(markers[0]?.name).toBe('Опушка')
})

it('uses physical N once and ignores held keys, editors, blocked UI and dead characters', async () => {
    const player = characterFixture('self')
    const wrapper = mount(AutomationPanels, {
        props: {
            snapshot: worldFixture([player]),
            player,
            characters: [player],
            connected: true,
            blocked: false,
        },
        attachTo: document.body,
    })
    wrappers.push(wrapper)
    const press = (options: KeyboardEventInit = {}) =>
        window.dispatchEvent(
            new KeyboardEvent('keydown', {
                code: 'KeyN',
                key: 'т',
                bubbles: true,
                cancelable: true,
                ...options,
            })
        )
    press()
    press({ repeat: true })
    expect(wrapper.emitted('command')).toEqual([[{ type: 'marker_create' }]])
    await wrapper.setProps({ blocked: true })
    press()
    await wrapper.setProps({ blocked: false, player: characterFixture('self', { alive: false }) })
    press()
    expect(wrapper.emitted('command')).toHaveLength(1)
    await wrapper.setProps({ player })
    wrapper.vm.open('markers')
    await flushPromises()
    const input = wrapper.get('input')
    ;(input.element as HTMLInputElement).focus()
    await input.trigger('keydown', { code: 'KeyN', key: 'т' })
    expect(wrapper.emitted('command')).toHaveLength(1)
})

it('edits and reorders a private scenario copy while retaining the running snapshot', async () => {
    const automation = automationFixture()
    automation.run = scenarioRunFixture()
    const original = structuredClone(automation)
    const wrapper = mount(ScenarioPanel, {
        props: { automation, playerId: 'self', available: true, targets: [] },
        attachTo: document.body,
    })
    wrappers.push(wrapper)
    await wrapper.get('[aria-label="Поднять шаг 2"]').trigger('click')
    const save = wrapper.findAll('button').find((button) => button.text() === 'Сохранить')!
    await save.trigger('click')
    const command = wrapper.emitted('command')?.[0]?.[0]
    expect(command).toMatchObject({
        type: 'scenario_save',
        scenario: {
            main: [{ id: 'wood' }, { id: 'go-tree' }, { id: 'go-chest' }, { id: 'stash' }],
        },
    })
    expect(automation).toEqual(original)
    expect(wrapper.text()).toContain('шаг 2/4')
})

it('keeps a new draft through repeated snapshots and sends only a server-approved helper assignment', async () => {
    const automation = automationFixture()
    const wrapper = mount(ScenarioPanel, {
        props: { automation, playerId: 'self', available: true, targets: [] },
    })
    wrappers.push(wrapper)
    const select = wrapper.get('select')
    await select.setValue('')
    const name = wrapper.get('input')
    await name.setValue('Ожидание')
    const addSelect = wrapper
        .findAll('label')
        .find((label) => label.text().startsWith('Новый шаг'))!
        .get('select')
    await addSelect.setValue('wait')
    await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Добавить шаг')!
        .trigger('click')
    await wrapper.setProps({ automation: structuredClone(automation) })
    expect(wrapper.get('input').element).toHaveProperty('value', 'Ожидание')
    expect(wrapper.findAll('.scenario-steps > li')).toHaveLength(1)
    await select.setValue('lumber')
    await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Сбросить изменения')!
        .trigger('click')
    const target = wrapper
        .findAll('label')
        .find((label) => label.text().startsWith('Кто выполняет'))!
        .get('select')
    await target.setValue('quest-helper')
    const start = wrapper.findAll('button').find((button) => button.text() === 'Запустить')!
    expect(start.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Сначала выполните задание Миры.')
    await target.setValue('wanderer')
    await start.trigger('click')
    expect(wrapper.emitted('command')?.at(-1)).toEqual([
        { type: 'scenario_start', scenarioId: 'lumber', targetId: 'wanderer' },
    ])
})

it('keeps run controls available outside editors without cancelling it on focus', async () => {
    const player = characterFixture('self')
    const snapshot = {
        ...worldFixture([player]),
        automation: {
            ...automationFixture(),
            run: scenarioRunFixture({ status: 'paused', reason: 'Нет видимого дерева.' }),
        },
    }
    const releaseUiControls = vi.fn<() => void>()
    const wrapper = mount(AutomationPanels, {
        props: {
            snapshot,
            player,
            characters: [player],
            connected: true,
            blocked: false,
            game: { releaseUiControls } as unknown as RatataGame,
        },
    })
    wrappers.push(wrapper)
    await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Продолжить')!
        .trigger('click')
    expect(wrapper.emitted('command')?.[0]).toEqual([{ type: 'scenario_resume' }])
    wrapper.vm.open('scenarios')
    await flushPromises()
    expect(releaseUiControls).toHaveBeenCalledOnce()
    expect(wrapper.emitted('command')).not.toContainEqual([{ type: 'cancel_control' }])
})

it('retains numeric edits before blur across live snapshots, temporary clearing and reordering', async () => {
    const automation = automationFixture()
    automation.scenarios[0]!.main = [
        { id: 'wait-a', kind: 'wait', durationMs: 1000 },
        { id: 'wait-b', kind: 'wait', durationMs: 1000 },
    ]
    const wrapper = mount(ScenarioPanel, {
        props: { automation, playerId: 'self', available: true, targets: [] },
    })
    wrappers.push(wrapper)
    const numbers = wrapper.findAll<HTMLInputElement>('.scenario-steps input[type="number"]')
    numbers[0]!.element.value = ''
    await numbers[0]!.trigger('input')
    await wrapper.setProps({ automation: structuredClone(automation), targets: [] })
    expect(numbers[0]!.element.value).toBe('')
    numbers[0]!.element.value = '30'
    await numbers[0]!.trigger('input')
    await wrapper.setProps({ automation: structuredClone(automation), targets: [] })
    expect(numbers[0]!.element.value).toBe('30')
    numbers[1]!.element.value = '20'
    await numbers[1]!.trigger('input')
    await wrapper.get('[aria-label="Поднять шаг 2"]').trigger('click')
    await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Сохранить')!
        .trigger('click')
    expect(wrapper.emitted('command')?.at(-1)).toMatchObject([
        {
            type: 'scenario_save',
            scenario: {
                main: [
                    { id: 'wait-b', durationMs: 20_000 },
                    { id: 'wait-a', durationMs: 30_000 },
                ],
            },
        },
    ])
})

it('recognizes a saved definition after the server reorders object properties', async () => {
    const automation = automationFixture()
    const wrapper = mount(ScenarioPanel, {
        props: { automation, playerId: 'self', available: true, targets: [] },
    })
    wrappers.push(wrapper)
    const definition = automation.scenarios[0]!
    await wrapper.setProps({
        automation: {
            ...automation,
            scenarios: [
                {
                    main: definition.main.map(
                        (step) => Object.fromEntries(Object.entries(step).reverse()) as ScenarioStep
                    ),
                    reactions: definition.reactions,
                    sequences: definition.sequences,
                    repeat: definition.repeat,
                    name: definition.name,
                    id: definition.id,
                },
            ],
        },
    })
    const start = wrapper.findAll('button').find((button) => button.text() === 'Запустить')!
    expect(start.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('Сохраните изменения перед запуском.')
    await start.trigger('click')
    expect(wrapper.emitted('command')?.at(-1)).toEqual([
        { type: 'scenario_start', scenarioId: 'lumber' },
    ])
})

it('copies a saved route with fresh identifiers and keeps reaction references valid', async () => {
    const automation = automationFixture()
    const original = automation.scenarios[0]!
    original.sequences = [
        { id: 'after', name: 'Ожидание', steps: [{ id: 'wait', kind: 'wait', durationMs: 1000 }] },
    ]
    original.reactions = [
        {
            id: 'rule',
            trigger: { kind: 'step_result', stepId: original.main[0]!.id, status: 'succeeded' },
            sequenceId: 'after',
        },
    ]
    const wrapper = mount(ScenarioPanel, {
        props: { automation, playerId: 'self', available: true, targets: [] },
    })
    wrappers.push(wrapper)
    const button = (name: string) =>
        wrapper.findAll('button').find((entry) => entry.text() === name)!
    await button('Создать копию').trigger('click')
    expect(wrapper.emitted('command')).toBeUndefined()
    expect(button('Запустить').attributes('disabled')).toBeDefined()
    await button('Сохранить').trigger('click')

    const command = wrapper.emitted('command')?.at(-1)?.[0] as Extract<
        AutomationCommand,
        { type: 'scenario_save' }
    >
    expect(command.type).toBe('scenario_save')
    expect(command.scenario.id).not.toBe(original.id)
    expect(command.scenario.main[0]?.id).not.toBe(original.main[0]?.id)
    expect(command.scenario.sequences[0]?.id).not.toBe(original.sequences[0]?.id)
    expect(command.scenario.reactions[0]).toMatchObject({
        sequenceId: command.scenario.sequences[0]?.id,
        trigger: { kind: 'step_result', stepId: command.scenario.main[0]?.id },
    })
})

it('checks template bindings and accepts pseudocode only after explicit apply', async () => {
    const wrapper = mount(ScenarioPanel, {
        props: {
            automation: { ...automationFixture(), markers: [], scenarios: [] },
            playerId: 'self',
            available: true,
            targets: [],
        },
    })
    wrappers.push(wrapper)
    const button = (name: string) =>
        wrapper.findAll('button').find((entry) => entry.text() === name)!
    await button('Готовые сценарии').trigger('click')
    await button('Создать копию').trigger('click')
    expect(wrapper.get('input').element).toHaveProperty('value', 'Лесоруб')
    await button('Сохранить').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('Сценарий не сохранён')
    expect(wrapper.emitted('command')).toBeUndefined()

    await button('Псевдокод').trigger('click')
    const text = wrapper.get('textarea')
    await text.setValue('repeat once\nmain {\n  unexpected\n}')
    expect(button('Сохранить').attributes('disabled')).toBeDefined()
    await button('Применить псевдокод').trigger('click')
    expect(
        wrapper.findAll('[role="alert"]').some((entry) => entry.text().includes('Строка 3'))
    ).toBe(true)
    expect(wrapper.emitted('command')).toBeUndefined()
    await text.setValue('repeat once\nmain {\n  wait 1s\n}')
    await button('Применить псевдокод').trigger('click')
    await button('Конструктор').trigger('click')
    expect(wrapper.findAll('.scenario-steps > li')).toHaveLength(1)
    await button('Сохранить').trigger('click')
    expect(wrapper.emitted('command')?.at(-1)?.[0]).toMatchObject({
        type: 'scenario_save',
        scenario: {
            name: 'Лесоруб',
            main: [{ kind: 'wait', durationMs: 1000 }],
            sequences: [],
            reactions: [],
        },
    })
})

it('creates a friendly reaction with the trigger character as the follow target', async () => {
    const wrapper = mount(ScenarioPanel, {
        props: {
            automation: { ...automationFixture(), scenarios: [] },
            playerId: 'self',
            available: true,
            targets: [],
        },
    })
    wrappers.push(wrapper)
    const button = (name: string) =>
        wrapper.findAll('button').find((entry) => entry.text() === name)!
    await button('Добавить последовательность').trigger('click')
    const sequence = wrapper.get('ol[aria-label="Последовательности"]')
    await sequence.get('select').setValue('follow')
    await sequence
        .findAll('button')
        .find((entry) => entry.text() === 'Добавить шаг')!
        .trigger('click')
    const target = sequence.findAll('label').find((entry) => entry.text().startsWith('Выбор цели'))!
    await target.get('select').setValue('reaction_target')
    await button('Добавить реакцию').trigger('click')
    const reaction = wrapper.get('ol[aria-label="Реакции"]')
    await reaction.get('select').setValue('friendly_nearby')
    await reaction.get('input[type="checkbox"]').setValue(true)
    await button('Сохранить').trigger('click')
    expect(wrapper.emitted('command')?.at(-1)?.[0]).toMatchObject({
        type: 'scenario_save',
        scenario: {
            main: [],
            sequences: [{ steps: [{ kind: 'follow', target: 'reaction_target' }] }],
            reactions: [
                {
                    trigger: {
                        kind: 'friendly_nearby',
                        distanceTiles: 5,
                        onlyWhenNotFollowing: true,
                    },
                },
            ],
        },
    })
})
