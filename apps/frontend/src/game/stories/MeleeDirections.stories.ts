import '../../assets/base.css'
import '../ui/rpgControls.css'

import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { renderMeleeAlignmentStory } from './renderMeleeAlignmentStory'

export default {
    title: 'Combat/Melee directions',
} satisfies Meta
type Story = StoryObj

export const OrdinaryAttack: Story = {
    name: 'Обычный удар · персонаж и область атаки',
    render: () => renderMeleeAlignmentStory('slash'),
}
export const SkeletonStrike: Story = {
    name: 'Костяной удар · персонаж и область атаки',
    render: () => renderMeleeAlignmentStory('bone'),
}
