import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import GameNotice from './GameNotice.vue'

type StoryArgs = InstanceType<typeof GameNotice>['$props']
const meta = {
    title: 'Pages/gameplay/GameNotice',
    args: { text: 'Сохранено в журнале приключений' },
    argTypes: { text: { control: 'text' } },
    render: (args) => renderVueStory(GameNotice, args),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
