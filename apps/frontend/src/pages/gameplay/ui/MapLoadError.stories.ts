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
        graphics: { control: 'select', options: [undefined, 'recovering', 'failed'] },
    },
    render: (args) => renderVueStory(MapLoadError, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
export const RestoringGraphics: StoryObj<StoryArgs> = {
    args: { graphics: 'recovering', status: 'Loading map' },
}
export const GraphicsRetry: StoryObj<StoryArgs> = {
    args: { graphics: 'failed', status: 'Graphics recovery failed' },
}
