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
        // These slices describe a single window and a region's lore.
        files: ['./src/entities/{character-window,region-lore}/**'],
        rules: { 'fsd/inconsistent-naming': 'off' },
    },
    {
        // Steiger misses consumers in the game adapters and the temporarily excluded widgets.
        files: [
            './src/entities/{asset-credits,character-window,chats,constellations,dialogues,exchanges,items,menus,player-effects,player-vitals,quests,quick-actions,region-lore,shops}/**',
            './src/widgets/{constellation-atlas,shops}/**',
        ],
        rules: { 'fsd/insignificant-slice': 'off' },
    },
])
