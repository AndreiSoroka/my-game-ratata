import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([
    ...fsd.configs.recommended,
    // Enable widget checks separately when that layer is ready.
    { ignores: ['./src/widgets/**'] },
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
        // Steiger misses consumers in the game adapter and the temporarily excluded widgets.
        files: [
            './src/entities/{character-window,chats,exchanges,menus,player-effects,player-vitals,quests,quick-actions}/**',
        ],
        rules: { 'fsd/insignificant-slice': 'off' },
    },
])
