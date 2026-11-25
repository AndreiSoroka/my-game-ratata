import '../assets/app.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderVueStory } from '@/shared/lib/storybook'

import App from './App.vue'

const meta = {
    title: 'App/App',
    render: () => renderVueStory(App, {}, { padding: '0' }),
} satisfies Meta
export default meta

export const Default: StoryObj = {}
