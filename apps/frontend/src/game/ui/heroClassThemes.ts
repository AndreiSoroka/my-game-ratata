import type { HeroClass } from '@my-game-ratata/contracts'

import type { DarkPanelTheme } from '../../shared/ui/theme'

const themes: Record<HeroClass, DarkPanelTheme> = {
    vanguard: { border: 'border-012', surface: '#2a2823f0', accent: '#c4b49c' },
    ranger: {
        border: 'border-017',
        surface: 'var(--ui-dark-panel-surface)',
        accent: 'var(--ui-dark-panel-border)',
    },
    arcanist: { border: 'border-018', surface: '#222832f0', accent: '#aeb8c6' },
    cleric: { border: 'border-010', surface: '#2d3025f0', accent: '#c3b998' },
}

export function heroClassTheme(
    heroClass?: HeroClass | null,
    context: 'game' | 'form' = 'game'
): DarkPanelTheme | undefined {
    // In the classic game theme, each panel keeps its own original border and fill.
    if (heroClass == null || (heroClass === 'ranger' && context === 'game')) return undefined
    return themes[heroClass]
}
