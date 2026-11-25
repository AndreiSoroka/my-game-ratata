import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { worldFixture } from '@/game/testing/characterFixture'
import { playerStatusFixture } from '@/game/testing/playerStatusFixture'
import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'

import GameHud from './GameHud.vue'

type StoryArgs = Pick<InstanceType<typeof GameHud>['$props'], 'player' | 'snapshot'> & {
    surface: StorySlot
    content: StorySlot
}

const player = playerStatusFixture()
const meta = {
    title: 'Pages/gameplay/GameHud',
    args: { player, snapshot: worldFixture([player]), surface: 'none', content: 'none' },
    argTypes: {
        player: { control: 'object' },
        snapshot: { control: 'object' },
        surface: storySlotControl('Поверхность игры'),
        content: storySlotControl('Содержимое HUD'),
    },
    render: ({ surface, content, ...props }) =>
        renderVueStory(
            {
                render: () =>
                    h(GameHud, props, {
                        surface: storySlot(surface, 'Игровое поле', () =>
                            h('div', { style: 'min-height:320px;background:#456048' }, 'Карта')
                        ),
                        default: storySlot(content, 'Цель выбрана', () =>
                            h(UiButton, {}, () => 'Поговорить')
                        ),
                    }),
            },
            {}
        ),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
export const Startup: StoryObj<StoryArgs> = { args: { player: undefined, snapshot: undefined } }
