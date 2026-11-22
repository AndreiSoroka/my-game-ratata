import { type DeityId, prayerAbilityForDeity } from '@my-game-ratata/contracts'
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import { developmentCharacterFixture } from '../testing/developmentFixture'
import { masteriesFixture } from '../testing/masteryFixture'
import ArcanaStudy from './ArcanaStudy.vue'
import FaithKnowledge from './FaithKnowledge.vue'

it('explains the learner Magic-three gate and sends teaching only for an eligible learner', async () => {
    const teacher = { ...developmentCharacterFixture('arcanist'), id: 'teacher' }
    teacher.abilities!.known.push('fireball')
    const student = { ...developmentCharacterFixture('vanguard'), id: 'student' }
    student.progression!.masteries = masteriesFixture({ magic: 2 })
    const view = mount(ArcanaStudy, { props: { player: teacher, characters: [student] } })
    const button = () =>
        view.findAll('button').find((entry) => entry.text() === 'Научить огненной стреле')!
    expect(button().attributes('disabled')).toBeDefined()
    expect(view.text()).toContain('Ученику требуется Магия 3.')
    await button().trigger('click')
    expect(view.emitted('command')).toBeUndefined()
    const eligible = {
        ...student,
        progression: { ...student.progression!, masteries: masteriesFixture({ magic: 3 }) },
    }
    await view.setProps({ characters: [eligible] })
    expect(button().attributes('disabled')).toBeUndefined()
    await button().trigger('click')
    expect(view.emitted('command')).toEqual([[{ type: 'teach_magic', targetId: 'student' }]])
    view.unmount()
})

it.each([
    ['hearth', 'Шанс лечения'],
    ['road', 'Шанс восстановления энергии'],
    ['lantern', 'Шанс восстановления маны'],
    ['grave', 'Шанс лечения нежити'],
] as const)(
    'labels the known %s deity chance by its actual restorative effect',
    (id: DeityId, label: string) => {
        const player = developmentCharacterFixture('cleric')
        player.abilities!.known = [prayerAbilityForDeity(id)]
        player.progression!.deity = { ...player.progression!.deity, id, successChance: 0.55 }
        const view = mount(FaithKnowledge, { props: { player, characters: [] } })
        expect(view.text()).toContain(`${label}: 55%`)
        expect(view.text()).not.toContain('Шанс ответа')
        view.unmount()
    }
)
