import type { HeroClass } from '@my-game-ratata/contracts'

import type { DarkPanelTheme } from '@/shared/ui/theme'

const themes: Record<HeroClass, DarkPanelTheme> = {
    vanguard: { border: 'border-012', surface: '#38261df0', accent: '#d6a775' },
    ranger: {
        border: 'border-017',
        surface: 'var(--ui-dark-panel-surface)',
        accent: 'var(--ui-dark-panel-border)',
    },
    arcanist: { border: 'border-018', surface: '#25243ff0', accent: '#c3adeb' },
    cleric: { border: 'border-010', surface: '#33331df0', accent: '#e1cd94' },
}

export function heroClassTheme(
    heroClass?: HeroClass | null,
    context: 'game' | 'form' = 'game'
): DarkPanelTheme | undefined {
    // In the classic game theme, each panel keeps its own original border and fill.
    if (heroClass == null || (heroClass === 'ranger' && context === 'game')) return undefined
    return themes[heroClass]
}
