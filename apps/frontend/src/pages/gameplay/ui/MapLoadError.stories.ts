import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import MapLoadError from './MapLoadError.vue'

type StoryArgs = InstanceType<typeof MapLoadError>['$props']
const meta = {
    title: 'Pages/gameplay/MapLoadError',
    args: { message: 'Карта временно недоступна', status: 'Map loading failed' },
    argTypes: {
        message: { control: 'text' },
        status: { control: 'select', options: ['Map loading failed', 'Disconnected'] },
    },
    render: (args) => renderVueStory(MapLoadError, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
