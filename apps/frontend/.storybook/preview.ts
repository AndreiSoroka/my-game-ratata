/// <reference types="vite/client" />

import '../src/assets/base.css'

import { HERO_BACKGROUND_DEFINITIONS, heroClasses } from '@my-game-ratata/contracts'
import type { Preview } from '@storybook/web-components-vite'

import { heroClassTheme } from '@/entities/character-window'

import { parseStoryHeroClass } from '../src/game/stories/storyHeroClass'
import { withVueStorySetup } from '../src/shared/lib/storybook'
import { lightUiColors, provideDarkPanelTheme } from '../src/shared/ui/theme'

function canvasColor(reference: string): string {
    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(reference.slice(4, -1))
        .trim()
    return value || reference
}

const preview: Preview = {
    globalTypes: {
        heroClass: {
            description: 'Класс героя',
            toolbar: {
                title: 'Класс героя',
                icon: 'paintbrush',
                items: [
                    { value: 'story', title: 'По умолчанию' },
                    ...heroClasses.map((heroClass) => ({
                        value: heroClass,
                        title: HERO_BACKGROUND_DEFINITIONS[heroClass].name,
                    })),
                ],
                dynamicTitle: true,
            },
        },
    },
    initialGlobals: {
        backgrounds: { value: 'wood', grid: false },
        heroClass: 'story',
    },
    decorators: [
        (story, { globals, parameters }) => {
            const heroClass =
                parseStoryHeroClass(globals.heroClass) ?? parseStoryHeroClass(parameters.heroClass)
            if (!heroClass) return story()

            const theme = heroClassTheme(heroClass)
            return withVueStorySetup(() => provideDarkPanelTheme(theme), story)
        },
    ],
    parameters: {
        backgrounds: {
            disable: true,
            options: {
                wood: { name: 'Wood', value: canvasColor(lightUiColors.button.wood.bottom) },
                parchment: { name: 'Parchment', value: canvasColor(lightUiColors.panel.parchment) },
                dark: { name: 'Dark', value: canvasColor('var(--vt-c-black-soft)') },
            },
        },
        a11y: {
            test: 'todo',
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'fullscreen',
    },
}

export default preview
