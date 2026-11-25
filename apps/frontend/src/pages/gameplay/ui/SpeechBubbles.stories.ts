import type { WorldSnapshot } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, type VNodeRef } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'
import { UiButton } from '@/shared/ui/common'

import { characterFixture, worldFixture } from '../../../game/testing/characterFixture'
import SpeechBubbles from './SpeechBubbles.vue'

interface StoryArgs {
    waiting: boolean
    name: string
}

function speechFixture(name: string, waiting: boolean) {
    const player = characterFixture('player')
    const npc = characterFixture('npc_guard_1', { nickname: name })
    const snapshot: WorldSnapshot = {
        ...worldFixture([player, npc]),
        social: {
            speechActivity: waiting ? [{ actorId: npc.id, kind: 'typing', id: 'preview' }] : [],
        },
    }
    return {
        player,
        game: {
            projectCharacter: () => ({
                x: 145,
                y: 180,
                lowerY: 210,
                width: Math.min(560, window.innerWidth),
                height: 520,
            }),
        },
        snapshot,
    }
}

const meta = {
    title: 'Game/SpeechBubbles',
    args: { waiting: true, name: 'Стражница Рада' },
    argTypes: { waiting: { control: 'boolean' }, name: { control: 'text' } },
    render: ({ name, waiting }) => renderVueStory(SpeechBubbles, speechFixture(name, waiting)),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Mumble: Story = {
    render: ({ name }) =>
        renderVueStory(
            {
                setup() {
                    const props = speechFixture(name, false)
                    let speaker: InstanceType<typeof SpeechBubbles> | undefined
                    let receipt = 0
                    function replay(): void {
                        speaker?.receive({
                            kind: 'chat',
                            actorId: 'npc_guard_1',
                            targetId: props.player.id,
                            speechId: ++receipt,
                            text: 'М-м-м-м-м…',
                        })
                    }
                    const mountSpeaker: VNodeRef = (value) => {
                        speaker = (value ?? undefined) as typeof speaker
                    }
                    return () => [
                        h(SpeechBubbles, { ...props, ref: mountSpeaker }),
                        h(UiButton, { onClick: replay }, () => 'Воспроизвести мычание'),
                    ]
                },
            },
            {}
        ),
}
