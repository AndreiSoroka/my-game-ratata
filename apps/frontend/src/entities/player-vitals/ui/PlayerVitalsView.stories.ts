import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { HudFrame } from '@/shared/ui/common/hud-frame'

import type { PlayerVitalsViewProps } from '../model/playerVitals'
import PlayerVitalsView from './PlayerVitalsView.vue'

const percentage = { control: { type: 'range', min: 0, max: 100, step: 1 } } as const
const number = { control: { type: 'number', min: 0 } } as const

const meta = {
    title: 'Entities/Player vitals/PlayerVitalsView',
    args: {
        compact: true,
        nickname: 'Андрей Сорока',
        hpPercent: 60,
        hpAnimated: false,
        manaPercent: 25,
        manaAnimated: false,
        energyPercent: 82,
        energyAnimated: false,
        dimSecondaryResources: false,
    },
    argTypes: {
        compact: { control: 'boolean' },
        nickname: { control: 'text' },
        hpPercent: percentage,
        hpAnimated: { control: 'boolean' },
        manaPercent: percentage,
        manaAnimated: { control: 'boolean' },
        energyPercent: percentage,
        energyAnimated: { control: 'boolean' },
        dimSecondaryResources: { control: 'boolean' },
        hpCurrent: number,
        hpMax: number,
        manaCurrent: number,
        manaMax: number,
        energyCurrent: number,
        energyMax: number,
    },
    render(args) {
        const host = renderVueStory(
            {
                render() {
                    const vitals = h(PlayerVitalsView, { ...args })
                    return args.compact
                        ? h(HudFrame, { style: { width: 'min(220px, 100%)' } }, () => vitals)
                        : vitals
                },
            },
            {},
            { padding: '16px' }
        )
        host.style.maxWidth = '362px'
        return host
    },
} satisfies Meta<PlayerVitalsViewProps>

export default meta
type Story = StoryObj<PlayerVitalsViewProps>

export const Normal: Story = {}

export const AuthorizedNumbers: Story = {
    args: {
        hpCurrent: 18,
        hpMax: 30,
        manaCurrent: 10,
        manaMax: 40,
        energyCurrent: 123,
        energyMax: 150,
    },
}
