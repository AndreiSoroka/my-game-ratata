import '../../assets/base.css'
import '../ui/rpgControls.css'

import type { CharacterFacing } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'

import { effectHeading } from '../runtime/combatEffectPose'
import { effectPreview, type EffectSurface } from './effectPreview'

export default {
    title: 'Combat/Melee directions',
    args: { surface: 'grass' },
    argTypes: { surface: { control: 'select', options: ['grass', 'stone', 'room'] } },
} satisfies Meta
type Story = StoryObj
const directions: { facing: CharacterFacing; label: string }[] = [
    { facing: 'right', label: 'Вправо' },
    { facing: 'down', label: 'Вниз' },
    { facing: 'left', label: 'Влево' },
    { facing: 'up', label: 'Вверх' },
]
function meleePreview(kind: 'slash' | 'bone', surface: EffectSurface): HTMLElement {
    return effectPreview(
        'hearth',
        directions.map(({ facing, label }) => {
            const source = { position: { x: 0, y: 0 }, facing }
            return { kind, label, origin: true, rotation: effectHeading(source, source) }
        }),
        surface
    )
}
export const OrdinaryAttack: Story = {
    name: 'Обычный удар · четыре направления',
    render: ({ surface }) => meleePreview('slash', surface),
}
export const SkeletonStrike: Story = {
    name: 'Костяной удар · четыре направления',
    render: ({ surface }) => meleePreview('bone', surface),
}
