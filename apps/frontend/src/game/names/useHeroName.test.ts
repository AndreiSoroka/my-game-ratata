import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'

import JoinGamePanel from '../../pages/start-game/ui/JoinGamePanel.vue'
import { useHeroName } from './useHeroName'

const originalLanguage = document.documentElement.lang
afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.lang = originalLanguage
})

it('retains an unconfirmed generated proposal across form teardown and allows reconnect only after acceptance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const Host = defineComponent({
        components: { JoinGamePanel },
        setup: () => ({ ...useHeroName(() => 'ru'), visible: ref(true) }),
        template: `<JoinGamePanel v-if="visible" v-model:nickname="nickname" hero-class="vanguard" :can-join="true" error-message=""
            @nickname-edited="edited" @regenerate-name="regenerate" @join="visible = false" />`,
    })
    const view = mount(Host)
    const proposed = view.get<HTMLInputElement>('input[type=text]').element.value
    const pending = view.vm.attempt()
    expect(pending.createOnly).toBe(true)
    await view.get('form').trigger('submit')
    expect(view.find('form').exists()).toBe(false)
    view.vm.visible = true
    await nextTick()
    expect(view.get<HTMLInputElement>('input[type=text]').element.value).toBe(proposed)
    expect(view.vm.attempt().createOnly).toBe(true)
    pending.onJoinAccepted()
    await view.get('form').trigger('submit')
    view.vm.visible = true
    await nextTick()
    expect(view.get<HTMLInputElement>('input[type=text]').element.value).toBe(proposed)
    expect(view.vm.attempt().createOnly).toBe(false)
    await view.get('input[type=text]').setValue('Свой герой')
    expect(view.vm.attempt()).toMatchObject({ nickname: 'Свой герой', createOnly: false })
    await view.get('[aria-label="Сгенерировать другое имя"]').trigger('click')
    expect(view.vm.attempt().createOnly).toBe(true)
    expect(view.vm.nickname).not.toBe('Свой герой')
    view.unmount()
})

it('does not let a delayed acknowledgement clear a newer generated proposal', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const state = useHeroName(() => 'ru')
    const old = state.attempt()
    state.regenerate()
    old.onJoinAccepted()
    expect(state.createOnly.value).toBe(true)
    state.setManually('Ручное имя')
    expect(state.attempt()).toMatchObject({ nickname: 'Ручное имя', createOnly: false })
    state.regenerate()
    expect(state.createOnly.value).toBe(true)
})

it('uses the page language for each deliberate generation without replacing an existing name on a language change', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    document.documentElement.lang = 'ru'
    const state = useHeroName()
    const russian = state.nickname.value
    expect(russian).toMatch(/^[А-ЯЁа-яё]+$/u)
    document.documentElement.lang = 'en-US'
    expect(state.nickname.value).toBe(russian)
    state.regenerate()
    expect(state.nickname.value).toMatch(/^[A-Za-z]+$/u)
})
