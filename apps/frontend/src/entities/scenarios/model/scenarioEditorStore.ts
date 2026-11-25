import type { AutomationSnapshot, ScenarioStep } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import {
    cloneScenario,
    moveScenarioStep,
    newScenario,
    newScenarioStep,
    sameScenario,
} from './scenarioEditor'

/** An editor session owns its draft and never mutates a received snapshot. */
export function useScenarioEditorStore(snapshot: () => AutomationSnapshot) {
    const first = snapshot().scenarios[0]
    const draft = ref(first ? cloneScenario(first) : newScenario())
    const selectedId = ref(first?.id ?? '')
    const addKind = ref<ScenarioStep['kind']>('go')
    const saved = computed(() => snapshot().scenarios.find(({ id }) => id === selectedId.value))
    const dirty = computed(() => !sameScenario(draft.value, saved.value))
    const canSave = computed(
        () =>
            draft.value.name.trim().length > 0 &&
            draft.value.steps.length > 0 &&
            (Boolean(saved.value) || snapshot().scenarios.length < 16)
    )

    function select(id: string): void {
        selectedId.value = id
        const scenario = snapshot().scenarios.find((entry) => entry.id === id)
        draft.value = scenario ? cloneScenario(scenario) : newScenario()
    }

    function add(): void {
        if (draft.value.steps.length < 64)
            draft.value.steps.push(newScenarioStep(addKind.value, snapshot().markers))
    }

    function move(index: number, direction: -1 | 1): void {
        draft.value.steps = moveScenarioStep(draft.value.steps, index, direction)
    }

    function updateStep(index: number, step: ScenarioStep): void {
        draft.value.steps[index] = step
    }

    function removeStep(index: number): void {
        draft.value.steps.splice(index, 1)
    }

    function prepareSave() {
        const scenario = cloneScenario(draft.value)
        scenario.name = scenario.name.trim()
        selectedId.value = scenario.id
        draft.value.name = scenario.name
        return scenario
    }

    return {
        draft,
        selectedId,
        addKind,
        saved,
        dirty,
        canSave,
        select,
        add,
        move,
        updateStep,
        removeStep,
        prepareSave,
    }
}
