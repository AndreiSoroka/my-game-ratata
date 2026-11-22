import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationStarCard from './ConstellationStarCard.vue'

interface StoryArgs {
    node: ConstellationNodeSnapshot
}

const prayer: ConstellationNodeSnapshot = {
    id: 'prayer-root',
    constellationId: 'prayer',
    x: 0,
    y: 0,
    parents: [],
    unlocked: true,
    kind: 'root',
    name: 'Молитва',
    description:
        'Вы можете помолиться за живых или мёртвых. Есть шанс, что божество ответит на ваши просьбы.',
    effectType: 'active',
    effects: ['Лечит вас или союзника.', 'Очищает могилы от тёмных сил.'],
}

const closed: ConstellationNodeSnapshot = {
    id: 'neighbor',
    constellationId: 'prayer',
    x: 0,
    y: 0,
    parents: [prayer.id],
    unlocked: false,
}

const meta = {
    title: 'Entities/constellations/ConstellationStarCard',
    args: { node: prayer },
    argTypes: { node: { control: 'object' } },
    render(args) {
        return renderVueStory(ConstellationStarCard, { node: args.node })
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Resurrection: Story = {
    args: {
        node: {
            ...closed,
            unlocked: true,
            kind: 'ability',
            name: 'Воскрешение',
            description:
                'Молитва зовёт обратно павшего товарища, пока его душа ещё не ушла в иной мир.',
            effectType: 'passive',
            effects: [
                'Позволяет поднимать павших товарищей, душа которых не успела уйти в мир иной.',
            ],
        },
    },
}

export const Unknown: Story = { args: { node: closed } }

export const PhysicalPassive: Story = {
    args: {
        node: {
            ...closed,
            constellationId: 'blade',
            parents: ['blade-root'],
            unlocked: true,
            kind: 'passive',
            name: 'Тяжёлая рука',
            description: 'За кромкой чувствуется вес уверенного движения.',
            effectType: 'passive',
            effects: ['Урон клинка увеличен на 10%.'],
        },
    },
}

export const PrayerPassive: Story = {
    args: {
        node: {
            ...closed,
            unlocked: true,
            kind: 'passive',
            name: 'Дальний голос',
            description: 'Тихий голос находит тех, кто стоит дальше от очага.',
            effectType: 'passive',
            effects: ['Радиус молитвы увеличивается на 1 клетку.'],
        },
    },
}
