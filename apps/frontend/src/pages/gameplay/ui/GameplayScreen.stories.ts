import '../../../assets/app.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'

import GameplayScreen from './GameplayScreen.vue'

interface StoryArgs {
    started: boolean
    start: StorySlot
}
const meta = {
    title: 'Pages/gameplay/GameplayScreen',
    args: { started: true, start: 'none' },
    argTypes: { started: { control: 'boolean' }, start: storySlotControl('Экран входа') },
    render: ({ started, start }) =>
        renderVueStory(
            {
                render: () =>
                    h(
                        GameplayScreen,
                        { started, canEnterWorld: async () => false },
                        {
                            start: storySlot<{ nickname: string }>(
                                start,
                                'Подготовка к игре',
                                ({ nickname }) =>
                                    h(UiButton, { disabled: true }, () => `Войти как ${nickname}`)
                            ),
                        }
                    ),
            },
            {},
            { padding: '0' }
        ),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
export const Startup: StoryObj<StoryArgs> = { args: { started: false, start: 'example' } }
