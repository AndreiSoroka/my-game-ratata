import { heroClasses, type WorldEmptyMode } from '@my-game-ratata/contracts'
import type { Meta, StoryObj } from '@storybook/web-components-vite'
import { h, provide } from 'vue'

import { renderVueStory } from '@/shared/lib/storybook'

import { worldAdministrationApiKey } from '../model/useWorldAdministration'
import JoinGameScreen from './JoinGameScreen.vue'

function provideExampleAdministration(): void {
    const origin = new URL(window.location.origin)
    let mode: WorldEmptyMode = 'online_ai'
    const session = { origin, token: 'storybook' }
    provide(worldAdministrationApiKey, {
        localAdminOrigin: () => origin,
        canUseRemoteAdmin: () => false,
        authorizeLocalAdmin: async () => session,
        authorizeAdminCode: async () => session,
        getWorldEmptyMode: async () => mode,
        saveWorldEmptyMode: async (_session, _signal, next) => (mode = next),
    })
}

type StoryArgs = InstanceType<typeof JoinGameScreen>['$props']
const meta = {
    title: 'Pages/start-game/JoinGameScreen',
    args: {
        nickname: 'Мира',
        heroClass: 'cleric',
        joining: false,
        readiness: 'ready',
        errorMessage: '',
    },
    argTypes: {
        nickname: { control: 'text' },
        heroClass: { options: heroClasses, control: 'select' },
        joining: { control: 'boolean' },
        readiness: {
            options: ['checking', 'ready', 'ai_unavailable', 'connection_error'],
            control: 'select',
        },
        errorMessage: { control: 'text' },
    },
    render: (args) =>
        renderVueStory(
            {
                setup() {
                    provideExampleAdministration()
                    return () => h(JoinGameScreen, args)
                },
            },
            {}
        ),
} satisfies Meta<StoryArgs>
export default meta

export const Default: StoryObj<StoryArgs> = {}
