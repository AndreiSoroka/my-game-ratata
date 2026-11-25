import {
    type AutomationCommand,
    type AutomationSnapshot,
    buildScenarioFromTemplate,
    formatScenarioText,
    parseScenarioText,
    SCENARIO_MAX_SCENARIOS,
    SCENARIO_MAX_STEPS,
    type ScenarioDefinition,
    type ScenarioTemplateId,
    type ScenarioTemplateParameters,
    validateScenarioDefinition,
} from '@my-game-ratata/contracts'
import { computed, nextTick, type Ref, ref, shallowRef, watch } from 'vue'

import {
    cloneScenario,
    copyScenario,
    editorId,
    newScenario,
    sameScenario,
} from '@/entities/scenarios'
import { tGame } from '@/shared/lib/i18n'

interface ScenarioDraftProps {
    automation: AutomationSnapshot
    available: boolean
}

function useScenarioText(draft: Ref<ScenarioDefinition>, props: ScenarioDraftProps) {
    const mode = ref<'builder' | 'text'>('builder')
    const textEditor = ref<{ focus: () => void }>()
    const text = ref('')
    const textBaseline = ref('')
    const textError = ref('')
    const textDirty = computed(() => text.value !== textBaseline.value)
    function resetText(): void {
        textBaseline.value = formatScenarioText(draft.value, props.automation.markers)
        text.value = textBaseline.value
        textError.value = ''
    }
    function editText(): void {
        if (mode.value === 'text') return
        resetText()
        mode.value = 'text'
    }
    function applyText(): void {
        if (!textDirty.value) return
        const result = parseScenarioText(text.value, {
            id: draft.value.id,
            name: draft.value.name,
            markers: props.automation.markers,
            previous: cloneScenario(draft.value),
        })
        if (!result.ok) {
            textError.value = tGame('game.automation.pseudocodeError', {
                line: result.line,
                message: result.message,
            })
            return
        }
        draft.value = result.scenario
        resetText()
    }
    return { mode, textEditor, text, textError, textDirty, resetText, editText, applyText }
}

function useDraftSelection(props: ScenarioDraftProps) {
    const first = props.automation.scenarios[0]
    const draft = ref(first ? cloneScenario(first) : newScenario())
    const pristine = shallowRef(cloneScenario(draft.value))
    const selectedId = ref(first?.id ?? '')
    const section = ref<'own' | 'templates'>('own')
    const scenarioName = ref<{ focus: () => void }>()
    const discardPrompt = ref<HTMLDivElement>()
    const discardAction = shallowRef<(() => void) | null>(null)
    const source = useScenarioText(draft, props)
    const { mode, textEditor, textDirty, resetText } = source
    const saved = computed(() =>
        props.automation.scenarios.find((entry) => entry.id === selectedId.value)
    )
    const dirty = computed(() => !sameScenario(draft.value, saved.value))
    async function guardDraft(action: () => void): Promise<void> {
        if (!textDirty.value && sameScenario(draft.value, saved.value ?? pristine.value)) {
            action()
            return
        }
        discardAction.value = action
        await nextTick()
        discardPrompt.value?.querySelector('button')?.focus()
    }
    function discard(): void {
        const action = discardAction.value
        discardAction.value = null
        action?.()
    }
    function keepEditing(): void {
        discardAction.value = null
        section.value = 'own'
        void nextTick(() =>
            (mode.value === 'text' ? textEditor.value : scenarioName.value)?.focus()
        )
    }
    function guardClose(action: () => void): void {
        if (discardAction.value) keepEditing()
        else void guardDraft(action)
    }
    function replaceDraft(scenario: ScenarioDefinition, savedId = ''): void {
        draft.value = cloneScenario(scenario)
        pristine.value = cloneScenario(scenario)
        selectedId.value = savedId
        section.value = 'own'
        mode.value = 'builder'
        resetText()
    }
    return {
        ...source,
        draft,
        saved,
        dirty,
        selectedId,
        section,
        scenarioName,
        discardAction,
        discardPrompt,
        guardDraft,
        guardClose,
        discard,
        keepEditing,
        replaceDraft,
    }
}

function useDraftLibrary(props: ScenarioDraftProps, editor: ReturnType<typeof useDraftSelection>) {
    const { selectedId, saved, guardDraft, replaceDraft, scenarioName } = editor
    const full = computed(() => props.automation.scenarios.length >= SCENARIO_MAX_SCENARIOS)
    function openNew(create: () => ScenarioDefinition): void {
        if (full.value) return
        void guardDraft(() => {
            replaceDraft(create())
            void nextTick(() => scenarioName.value?.focus())
        })
    }
    function newDraft(): void {
        openNew(newScenario)
    }
    function select(event: Event): void {
        const input = event.target as HTMLSelectElement
        const id = input.value
        if (id === selectedId.value) return
        input.value = selectedId.value
        const scenario = props.automation.scenarios.find((entry) => entry.id === id)
        if (scenario) void guardDraft(() => replaceDraft(scenario, id))
        else newDraft()
    }
    function copySaved(): void {
        const source = saved.value
        if (source) openNew(() => copyScenario(source))
    }
    function copyTemplate(
        id: ScenarioTemplateId,
        name: string,
        parameters: ScenarioTemplateParameters
    ): void {
        openNew(() => buildScenarioFromTemplate(id, editorId('scenario'), name, parameters))
    }
    return { full, newDraft, select, copySaved, copyTemplate }
}

export function useScenarioDraft(
    props: ScenarioDraftProps,
    send: (command: AutomationCommand) => void
) {
    const editor = useDraftSelection(props)
    const library = useDraftLibrary(props, editor)
    const { draft, saved, dirty, textDirty, selectedId, guardDraft, replaceDraft } = editor
    const saveError = ref('')
    const editorHint = computed(() =>
        tGame(
            props.automation.scenarios.length
                ? 'game.automation.actionsChooseValidVisibleTargets'
                : 'game.automation.emptyScenarioLibrary'
        )
    )
    const remainingSteps = computed(
        () =>
            SCENARIO_MAX_STEPS -
            draft.value.main.length -
            draft.value.sequences.reduce((count, sequence) => count + sequence.steps.length, 0)
    )
    const canSave = computed(
        () =>
            props.available &&
            draft.value.name.trim().length > 0 &&
            (draft.value.main.length > 0 || draft.value.reactions.length > 0) &&
            (Boolean(saved.value) || !library.full.value) &&
            !textDirty.value
    )
    function save(): void {
        if (!canSave.value || !dirty.value) return
        const result = validateScenarioDefinition(
            { ...cloneScenario(draft.value), name: draft.value.name.trim() },
            { markers: props.automation.markers }
        )
        if (!result.ok) {
            saveError.value = tGame('game.automation.validationError', { message: result.message })
            return
        }
        const { scenario } = result
        selectedId.value = scenario.id
        draft.value = scenario
        send({ type: 'scenario_save', scenario })
    }
    function remove(): void {
        const id = saved.value?.id
        if (!id || !props.available) return
        void guardDraft(() => {
            send({ type: 'scenario_delete', scenarioId: id })
            replaceDraft(newScenario())
        })
    }
    function repeat(event: Event): void {
        const value = (event.target as HTMLSelectElement).value
        draft.value.repeat = value === 'forever' ? null : value === 'once' ? 1 : 2
    }
    watch(
        draft,
        () => {
            saveError.value = ''
        },
        { deep: true, flush: 'sync' }
    )
    return {
        ...editor,
        ...library,
        saveError,
        editorHint,
        remainingSteps,
        canSave,
        save,
        remove,
        repeat,
    }
}
