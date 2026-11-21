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
        // Steiger cannot see these entities' consumers in the game adapter.
        files: ['./src/entities/{player-effects,player-vitals}/**'],
        rules: { 'fsd/insignificant-slice': 'off' },
    },
])
