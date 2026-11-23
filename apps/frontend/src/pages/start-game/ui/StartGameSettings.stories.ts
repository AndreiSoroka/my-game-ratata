import { type WorldEmptyMode, worldEmptyModes } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import type { AdminAccessState } from '../model/useWorldAdministration'
import StartGameSettings from './StartGameSettings.vue'

interface StoryArgs {
    access: AdminAccessState
    busy: boolean
    open: boolean
    error: string
    mode: WorldEmptyMode
}

const meta = {
    title: 'Pages/StartGame/StartGameSettings',
    args: { access: 'code', busy: false, open: false, error: '', mode: 'online_ai' },
    argTypes: {
        access: { control: 'select', options: ['checking', 'code', 'unavailable', 'authorized'] },
        busy: { control: 'boolean' },
        mode: { control: 'select', options: worldEmptyModes },
        open: { control: 'boolean' },
        error: { control: 'text' },
    },
    render: (args) => renderVueStory(StartGameSettings, { ...args }, { background: '#172820' }),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const LocalAdmin: Story = {
    args: { access: 'authorized' },
    render: (args) =>
        renderVueStory(
            {
                setup() {
                    const open = ref(args.open)
                    const mode = ref(args.mode)
                    return () =>
                        h(StartGameSettings, {
                            ...args,
                            mode: mode.value,
                            open: open.value,
                            onClose: () => (open.value = false),
                            onOpen: () => (open.value = true),
                            onSave: (value) => {
                                mode.value = value
                                open.value = false
                            },
                        })
                },
            },
            {},
            { background: '#172820' }
        ),
}
