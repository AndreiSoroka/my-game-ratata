import { inject, type InjectionKey, provide, reactive } from 'vue'

export interface ConstellationDebugPanels {
    mastery: boolean
    result: boolean
}

const panelsKey: InjectionKey<ConstellationDebugPanels> = Symbol('constellation-debug-panels')
const createPanels = () => reactive<ConstellationDebugPanels>({ mastery: false, result: false })

/** One preference per atlas, shared by every inspected star and result school. */
export function provideConstellationDebugPanels(): ConstellationDebugPanels {
    const panels = createPanels()
    provide(panelsKey, panels)
    return panels
}

export function useConstellationDebugPanels(): ConstellationDebugPanels {
    return inject(panelsKey, createPanels, true)
}
