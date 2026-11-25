import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([
    ...fsd.configs.recommended,
    {
        // The Excalibur runtime is a game adapter outside the FSD UI layers.
        files: ['./src/game/**'],
        rules: { 'fsd/typo-in-layer-name': 'off' },
    },
    {
        // The character window, region lore and progression each describe one domain concept.
        files: ['./src/entities/{character-window,region-lore,progression}/**'],
        rules: { 'fsd/inconsistent-naming': 'off' },
    },
    {
        // Domain slices can have multiple consumers within the single gameplay page.
        // This rule counts distinct consuming slices, not components within a page.
        files: [
            './src/entities/{asset-credits,character-window,chats,constellations,dialogues,exchanges,graves,items,menus,parties,player-effects,player-vitals,quests,quick-actions,region-lore,scenarios,shops}/**',
            './src/widgets/{chats,exchanges,player-effects,player-vitals,shops}/**',
        ],
        rules: { 'fsd/insignificant-slice': 'off' },
    },
])
