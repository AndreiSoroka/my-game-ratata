import '../../../assets/app.css'

import { HERO_BACKGROUND_DEFINITIONS, type HeroClass, heroClasses } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, ref } from 'vue'

import { renderVueStory, type StorySlot, storySlot, storySlotControl } from '@/shared/lib/storybook'

import { parseStoryHeroClass } from '../../../game/stories/storyHeroClass'
import JoinGamePanel from './JoinGamePanel.vue'
import StartGameReadiness from './StartGameReadiness.vue'
import StartGameSettings from './StartGameSettings.vue'

interface StoryArgs {
    heroClass: HeroClass
    nickname: string
    canJoin: boolean
    errorMessage: string
    settings: StorySlot
    readiness: StorySlot
}

const meta = {
    title: 'Game/JoinGamePanel',
    args: {
        heroClass: 'vanguard',
        nickname: 'Андрей Сорока',
        canJoin: true,
        errorMessage: '',
        settings: 'none',
        readiness: 'none',
    },
    argTypes: {
        nickname: { control: 'text' },
        canJoin: { control: 'boolean' },
        errorMessage: { control: 'text' },
        settings: storySlotControl('Настройки мира'),
        readiness: storySlotControl('Готовность мира'),
        heroClass: {
            name: 'Прошлое героя',
            options: heroClasses,
            control: {
                type: 'select',
                labels: Object.fromEntries(
                    heroClasses.map((id) => [id, HERO_BACKGROUND_DEFINITIONS[id].name])
                ),
            },
        },
    },
    render: ({ settings, readiness, ...args }, { globals }) =>
        renderVueStory(
            {
                setup() {
                    const heroClass = ref(parseStoryHeroClass(globals.heroClass) ?? args.heroClass)
                    const nickname = ref(args.nickname)
                    return () =>
                        h(
                            JoinGamePanel,
                            {
                                ...args,
                                heroClass: heroClass.value,
                                nickname: nickname.value,
                                'onUpdate:heroClass': (value) => (heroClass.value = value),
                                'onUpdate:nickname': (value) => (nickname.value = value),
                            },
                            {
                                settings: storySlot(settings, 'Настройки мира', () =>
                                    h(StartGameSettings, {
                                        access: 'code',
                                        busy: false,
                                        error: '',
                                        open: false,
                                    })
                                ),
                                readiness: storySlot(readiness, 'Мир готов', () =>
                                    h(StartGameReadiness, { status: 'ready' })
                                ),
                            }
                        )
                },
            },
            {},
            { padding: '0' }
        ),
} satisfies Meta<StoryArgs>
export default meta
type Story = StoryObj<StoryArgs>

export const Default: Story = {}
export const Ready: Story = {}
