import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import ConstellationBackground from './ConstellationBackground.vue'

type StoryArgs = Pick<
    InstanceType<typeof ConstellationBackground>['$props'],
    'origin' | 'dimensions' | 'unitScale' | 'seed' | 'zoom' | 'pan'
>

const meta = {
    title: 'Entities/constellations/ConstellationBackground',
    args: {
        origin: { x: 0, y: 0 },
        dimensions: { width: 700, height: 450 },
        unitScale: 1,
        seed: 'personal-sky',
        zoom: 1,
        pan: { x: 0, y: 0 },
    },
    argTypes: {
        origin: { control: 'object' },
        dimensions: { control: 'object' },
        unitScale: { control: { type: 'number', min: 0.1, step: 0.1 } },
        seed: { control: 'text' },
        zoom: { control: { type: 'range', min: 1, max: 8, step: 0.1 } },
        pan: { control: 'object' },
    },
    render(args) {
        const { x, y } = args.origin
        const { width, height } = args.dimensions
        const viewBox = `${x} ${y} ${width * args.unitScale} ${height * args.unitScale}`
        return renderVueStory(
            () =>
                h(
                    'svg',
                    {
                        viewBox,
                        style: {
                            display: 'block',
                            width: 'min(100%, 700px)',
                            background: '#08151f',
                        },
                    },
                    [h(ConstellationBackground, args)]
                ),
            {}
        )
    },
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}

export const Zoomed: Story = {
    args: { origin: { x: 262.5, y: 168.75 }, unitScale: 0.25, zoom: 4 },
}
