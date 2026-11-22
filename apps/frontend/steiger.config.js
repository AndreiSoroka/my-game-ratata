import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([
    ...fsd.configs.recommended,
    // Keep the existing widgets excluded while checking the constellation atlas.
    { ignores: ['./src/widgets/{chats,exchanges,player-effects,player-vitals}/**'] },
    {
        // The game adapter has a legacy directory name outside the FSD layers.
        files: ['./src/game/**'],
        rules: { 'fsd/typo-in-layer-name': 'off' },
    },
    {
        // The character-window slice owns one window and uses its singular name.
        files: ['./src/entities/character-window/**'],
        rules: { 'fsd/inconsistent-naming': 'off' },
    },
    {
        // Steiger misses consumers in the game adapters and the temporarily excluded widgets.
        files: [
            './src/entities/{character-window,chats,constellations,exchanges,menus,player-effects,player-vitals,quests,quick-actions}/**',
            './src/widgets/constellation-atlas/**',
        ],
        rules: { 'fsd/insignificant-slice': 'off' },
    },
])
