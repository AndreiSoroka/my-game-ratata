import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, onMounted, useTemplateRef } from 'vue'

import { characterFixture, worldFixture } from '@/game/testing/characterFixture'
import { renderVueStory } from '@/shared/lib/storybook'

import NearbyInteraction from './NearbyInteraction.vue'

const player = characterFixture('adventurer', { position: { x: 350, y: 350 } })
const merchant = characterFixture('merchant', {
    nickname: 'Савва',
    position: { x: 356, y: 350 },
    soul: { kind: 'echo', controlSource: 'script', canSpeak: true },
    interactions: { dialogueMode: 'scripted', aiDialogue: false, whisper: false, exchange: false },
})
type StoryArgs = InstanceType<typeof NearbyInteraction>['$props'] & { showMenu: boolean }
const meta = {
    title: 'Pages/gameplay/NearbyInteraction',
    args: {
        player,
        characters: [player, merchant],
        snapshot: worldFixture([player, merchant]),
        selectedKey: 'character:merchant',
        blocked: false,
        showMenu: true,
        isPositionVisible: () => true,
    },
    argTypes: {
        player: { control: 'object' },
        characters: { control: 'object' },
        snapshot: { control: 'object' },
        selectedKey: { control: 'text' },
        selectedId: { control: 'text' },
        selectedGraveId: { control: 'text' },
        blocked: { control: 'boolean' },
        showMenu: { control: 'boolean' },
        isPositionVisible: { control: false },
    },
    render: ({ showMenu, ...props }) =>
        renderVueStory(
            {
                setup() {
                    const interaction =
                        useTemplateRef<InstanceType<typeof NearbyInteraction>>('interaction')
                    onMounted(() => {
                        if (showMenu) interaction.value?.openMenu(props.selectedKey, true)
                    })
                    return () => h(NearbyInteraction, { ...props, ref: 'interaction' })
                },
            },
            {}
        ),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
