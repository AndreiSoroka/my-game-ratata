import { computed, inject, type InjectionKey, type MaybeRefOrGetter, provide, toValue } from 'vue'

import type { FantasyBorderVariant } from '../external/fantasy-ui-borders/border'

export interface DarkPanelTheme {
    readonly border: FantasyBorderVariant
    readonly surface: string
    readonly accent: string
}

const darkPanelThemeKey: InjectionKey<MaybeRefOrGetter<DarkPanelTheme | undefined>> =
    Symbol('darkPanelTheme')

export function provideDarkPanelTheme(theme: MaybeRefOrGetter<DarkPanelTheme | undefined>): void {
    provide(darkPanelThemeKey, theme)
}

export function useDarkPanelTheme() {
    const source = inject(darkPanelThemeKey, undefined)
    return computed(() => toValue(source))
}

export function darkPanelThemeStyle(theme: DarkPanelTheme | undefined) {
    if (!theme) return undefined
    return {
        '--ui-themed-panel-surface': theme.surface,
        '--ui-themed-panel-accent': theme.accent,
    }
}
