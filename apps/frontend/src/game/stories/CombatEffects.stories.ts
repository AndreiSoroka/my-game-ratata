import '../../assets/base.css'
import '../../pages/gameplay/ui/rpgControls.css'

import { ABILITY_DEFINITIONS, type DeityId } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { effectPreview, type EffectSurface } from './effectPreview'

export default {
    title: 'Combat/Authoritative effect shapes',
    args: { surface: 'grass' },
    argTypes: { surface: { control: 'select', options: ['grass', 'stone', 'room'] } },
} satisfies Meta
type Story = StoryObj
function prayer(
    deity: DeityId,
    resource: string,
    resurrection = false,
    surface: EffectSurface = 'grass'
): HTMLElement {
    return effectPreview(
        deity,
        [
            { kind: 'restore', label: `Восстановление · ${resource}` },
            ...(resurrection
                ? [
                      { kind: 'casting' as const, label: 'Воскрешение · 2.1 / 3 с' },
                      { kind: 'revive' as const, label: 'Возвращение к жизни' },
                      { kind: 'wave' as const, label: 'Волна · радиус 48 px' },
                  ]
                : []),
        ],
        surface
    )
}
export const Hearth: Story = {
    name: 'Хранитель Очага · пламя',
    render: ({ surface }) => prayer('hearth', 'HP', true, surface),
}
export const Road: Story = {
    name: 'Ветер Дорог · ветер',
    render: ({ surface }) => prayer('road', 'энергия', false, surface),
}
export const Lantern: Story = {
    name: 'Светоч · созвездие',
    render: ({ surface }) => prayer('lantern', 'мана', false, surface),
}
export const Grave: Story = {
    name: 'Хранитель Праха · разорванное кольцо',
    render: ({ surface }) => prayer('grave', 'HP нежити', true, surface),
}
export const Devotion: Story = {
    name: 'Молитва без цели',
    args: { deity: 'hearth' },
    argTypes: { deity: { control: 'select', options: ['hearth', 'road', 'lantern', 'grave'] } },
    render: ({ deity, surface }) =>
        effectPreview(deity, [{ kind: 'devotion', label: 'Молитва · без чуда' }], surface),
}
export const Barrier: Story = {
    render: () =>
        effectPreview('lantern', [
            { kind: 'barrier', label: 'Грани · 8 поглощения' },
            { kind: 'shards', label: 'Осыпание' },
        ]),
}
export const Projectiles: Story = {
    render: () =>
        effectPreview('hearth', [
            { kind: 'arrow', label: 'Быстрый выстрел' },
            { kind: 'spark', label: 'Искра · 200 мс' },
            { kind: 'fireball', label: 'Огненный шар · 400 мс' },
            { kind: 'bone', label: 'Костяной удар' },
        ]),
}

function archerShot(ability: 'shot' | 'sniper_shot', surface: EffectSurface): HTMLElement {
    return effectPreview(
        'hearth',
        [
            {
                kind: 'aim',
                label: `Прицеливание · ${ABILITY_DEFINITIONS[ability].windupMs} мс`,
                origin: true,
            },
            { kind: 'arrow', label: 'Выпуск стрелы', rotation: -Math.PI / 5 },
        ],
        surface
    )
}

export const ArcherShots: Story = {
    name: 'Снайперский выстрел',
    render: ({ surface }) => archerShot('sniper_shot', surface),
}
export const QuickShot: Story = {
    name: 'Быстрый выстрел',
    render: ({ surface }) => archerShot('shot', surface),
}

export const HearthLightStone: Story = {
    ...Hearth,
    name: 'Очаг · светлый камень',
    args: { surface: 'stone' },
}
export const GraveDarkRoom: Story = {
    ...Grave,
    name: 'Прах · тёмная комната',
    args: { surface: 'room' },
}
