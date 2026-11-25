import type { Meta, StoryObj } from '@storybook/web-components-vite'

import ExchangeConsentGallery from './ExchangeConsentGallery.vue'
import { renderVueStory } from './renderVueStory'

const meta = { title: 'Game/Exchange consent gallery' } satisfies Meta
export default meta
type Story = StoryObj

export const Default: Story = { render: () => renderVueStory(ExchangeConsentGallery, {}) }
