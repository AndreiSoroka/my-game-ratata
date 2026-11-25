<script setup lang="ts">
import {
    type MarkerDefinition,
    type ScenarioAbilityId,
    scenarioAbilityTargets,
    type ScenarioTemplateId,
    type ScenarioTemplateParameters,
    scenarioTemplates,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import type { ScenarioFarmPlot } from '@/entities/scenarios'
import { ScenarioFarmPlotField } from '@/entities/scenarios'
import { abilityName, gameLocale, tGame } from '@/shared/lib/i18n'
import { UiButton, UiInput, UiNumberInput, UiSelect } from '@/shared/ui/common'

const props = defineProps<{
    markers: MarkerDefinition[]
    plots: ScenarioFarmPlot[]
    abilities: ScenarioAbilityId[]
    full: boolean
}>()
const emit = defineEmits<{
    copy: [id: ScenarioTemplateId, name: string, parameters: ScenarioTemplateParameters]
}>()
const selectedId = ref<ScenarioTemplateId>('lumberjack')
const parameters = ref<ScenarioTemplateParameters>({})
const selected = computed(() => scenarioTemplates.find((entry) => entry.id === selectedId.value)!)
const coverAbilities = computed(() =>
    props.abilities.filter((id) => scenarioAbilityTargets(id).includes('self'))
)
const markerFields = computed(() => {
    const fields = [] as {
        key: 'workMarkerId' | 'storageMarkerId' | 'secondMarkerId' | 'shelterMarkerId'
        label: string
        optional?: boolean
    }[]
    const id = selectedId.value
    if (id !== 'retreat' && id !== 'follow')
        fields.push({ key: 'workMarkerId', label: tGame('game.automation.workMarker') })
    if (id === 'lumberjack' || id === 'miner' || id === 'farmer')
        fields.push({ key: 'storageMarkerId', label: tGame('game.automation.storageMarker') })
    if (id === 'patrol')
        fields.push({ key: 'secondMarkerId', label: tGame('game.automation.secondMarker') })
    if (id !== 'farmer' && id !== 'follow')
        fields.push({
            key: 'shelterMarkerId',
            label: tGame('game.automation.shelterMarker'),
            optional: id !== 'retreat',
        })
    return fields
})
function select(event: Event): void {
    const id = (event.target as HTMLSelectElement).value
    const template = scenarioTemplates.find((entry) => entry.id === id)
    if (!template) return
    selectedId.value = template.id
    parameters.value = {}
}
function setPlot(plot: ScenarioFarmPlot): void {
    parameters.value.plotId = plot.id
    parameters.value.plotLocationId = plot.locationId
}
function copy(): void {
    if (!props.full)
        emit('copy', selectedId.value, selected.value.name[gameLocale.value], {
            ...parameters.value,
        })
}
</script>

<template>
    <section class="automation-form">
        <label>
            {{ tGame('game.automation.templateSelection') }}
            <UiSelect :border-width="4" :value="selectedId" @change="select">
                <option
                    v-for="template in scenarioTemplates"
                    :key="template.id"
                    :value="template.id"
                >
                    {{ template.name[gameLocale] }}
                </option>
            </UiSelect>
        </label>
        <p>{{ selected.description[gameLocale] }}</p>
        <p class="automation-muted">
            {{
                tGame('game.automation.templateRequirements', {
                    requirements: selected.requirements[gameLocale],
                })
            }}
        </p>
        <div class="automation-fields">
            <label v-for="field in markerFields" :key="field.key">
                {{ field.label }}
                <UiSelect :border-width="4" v-model="parameters[field.key]">
                    <option :value="undefined">
                        {{
                            tGame(
                                field.optional
                                    ? 'game.automation.noOptionalMarker'
                                    : 'game.automation.noMarkerSelected'
                            )
                        }}
                    </option>
                    <option v-for="marker in markers" :key="marker.id" :value="marker.id">
                        {{ marker.number }} · {{ marker.name }}
                    </option>
                </UiSelect>
            </label>
            <ScenarioFarmPlotField
                v-if="selectedId === 'farmer'"
                :plot-id="parameters.plotId ?? ''"
                :location-id="parameters.plotLocationId ?? ''"
                :plots="plots"
                @change="setPlot"
            />
            <label v-if="selectedId === 'miner'">
                {{ tGame('game.automation.resource') }}
                <UiSelect
                    :border-width="4"
                    :model-value="parameters.resource ?? 'stone'"
                    @update:model-value="parameters.resource = $event"
                >
                    <option value="stone">{{ tGame('game.character.stone') }}</option>
                    <option value="scrap">{{ tGame('game.automation.scrapMetal') }}</option>
                </UiSelect>
            </label>
            <UiNumberInput
                v-if="selectedId === 'lumberjack' || selectedId === 'miner'"
                :model-value="parameters.amount ?? 3"
                :label="tGame('game.trade.quantity')"
                :min="1"
                :max="10000"
                @update:model-value="parameters.amount = $event"
            />
            <UiNumberInput
                v-if="
                    selectedId === 'retreat' ||
                    selectedId === 'follow' ||
                    parameters.shelterMarkerId
                "
                :model-value="parameters.distanceTiles ?? 5"
                :label="tGame('game.automation.distanceTiles')"
                :min="1"
                :max="64"
                @update:model-value="parameters.distanceTiles = $event"
            />
            <label
                v-if="
                    selectedId === 'retreat' ||
                    selectedId === 'patrol' ||
                    parameters.shelterMarkerId
                "
                class="automation-checkbox"
            >
                <UiInput v-model="parameters.dash" type="checkbox" />
                {{ tGame('game.automation.dash') }}
            </label>
            <label v-if="selectedId === 'retreat' && coverAbilities.length">
                {{ tGame('game.automation.optionalCover') }}
                <UiSelect :border-width="4" v-model="parameters.abilityId">
                    <option :value="undefined">
                        {{ tGame('game.automation.noCoverAbility') }}
                    </option>
                    <option v-for="ability in coverAbilities" :key="ability" :value="ability">
                        {{ abilityName(ability) }}
                    </option>
                </UiSelect>
            </label>
        </div>
        <div>
            <UiButton variant="primary" :disabled="full" @click="copy">
                {{ tGame('game.automation.copyScenario') }}
            </UiButton>
        </div>
    </section>
</template>
