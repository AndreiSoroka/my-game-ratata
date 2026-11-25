import type { ClientMessage, PlantTreePreview } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { characterFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import TreePlanting from './TreePlanting.vue'

type Props = InstanceType<typeof TreePlanting>['$props']
type Args = Pick<Props, 'player' | 'location'> & { available: boolean }
const meta = {
    title: 'Pages/Gameplay/TreePlanting',
    args: {
        player: characterFixture('planter', {
            inventory: [{ instanceId: 'sapling', itemId: 'sapling' }],
        }),
        location: { id: 'map-2-2', map: { tileWidth: 16, tileHeight: 16 } },
        available: true,
    },
    argTypes: {
        player: { control: 'object' },
        location: { control: 'object' },
        available: { control: 'boolean' },
    },
} satisfies Meta<Args>
export default meta
type Story = StoryObj<Args>

export const Default: Story = {
    render({ available, ...args }) {
        const listeners = new Set<(preview: PlantTreePreview) => void>()
        const game: Props['game'] = {
            planting: {
                subscribe(listener) {
                    listeners.add(listener)
                    return () => listeners.delete(listener)
                },
                preview() {},
                set() {},
            },
            projectPosition: () => ({
                x: 30,
                y: 120,
                width: Math.min(420, window.innerWidth),
                height: 520,
            }),
        }
        function onCommand(command: ClientMessage): void {
            if (command.type !== 'plant_tree_preview' || !args.location) return
            const preview: PlantTreePreview = {
                type: 'plant_tree_preview',
                requestId: command.requestId,
                locationId: args.location.id,
                position: command.position,
                available,
                bounds: { ...command.position, width: 32, height: 16 },
                ...(!available && { reason: 'Проход должен оставаться свободным.' }),
            }
            queueMicrotask(() => {
                for (const listener of listeners) listener(preview)
            })
        }
        return renderVueStory(TreePlanting, { ...args, game, onCommand })
    },
}
export const Blocked: Story = { ...Default, args: { available: false } }
