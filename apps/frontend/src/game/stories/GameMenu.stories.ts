import '../ui/rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import GameMenu from '../ui/GameMenu.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Interface/Game menu' } satisfies Meta
export default meta
type Story = StoryObj

export const Open: Story = { render: () => renderVueStory(GameMenu, {}) }
