<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { UiButton } from '@/shared/ui/common'

import { type CharacterTab, characterTabs } from '../model/characterTab'

defineOptions({ inheritAttrs: false })

defineProps<{ nickname: string }>()
const tab = defineModel<CharacterTab>('tab', { default: 'stats' })
const emit = defineEmits<{ close: [] }>()
const panel = ref<HTMLElement>()
defineExpose({ panel })

const closeButtonAttrs = {
    class: 'character-close',
    get 'aria-label'() {
        return tGame('game.character.closeCharacter')
    },
    onClick: () => emit('close'),
}

defineSlots<{
    frame?: () => unknown
    close?: (props: { buttonAttrs: typeof closeButtonAttrs }) => unknown
    tab?: (props: { label: string; buttonAttrs: ReturnType<typeof tabButtonAttrs> }) => unknown
    default?: (props: { tab: CharacterTab }) => unknown
    footer?: () => unknown
}>()

function tabButtonAttrs(id: CharacterTab) {
    return {
        id: `character-${id}-tab`,
        role: 'tab',
        'aria-selected': tab.value === id,
        'aria-controls': `character-${id}-panel`,
        tabindex: tab.value === id ? 0 : -1,
        onClick: () => (tab.value = id),
    }
}

function focusSelectedTab(): void {
    panel.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
}

async function tabKey(event: KeyboardEvent): Promise<void> {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) return
    event.preventDefault()
    const index = characterTabs.findIndex(({ id }) => id === tab.value)
    const lastIndex = characterTabs.length - 1
    const direction = event.code === 'ArrowRight' ? 1 : -1
    const nextIndex =
        event.code === 'Home'
            ? 0
            : event.code === 'End'
              ? lastIndex
              : (index + direction + characterTabs.length) % characterTabs.length
    tab.value = characterTabs[nextIndex]!.id
    await nextTick()
    focusSelectedTab()
}

function panelKey(event: KeyboardEvent): void {
    if (tab.value === 'quests' || event.code !== 'Tab') return
    const elements = Array.from(
        panel.value?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]'
        ) ?? []
    ).filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]'))
    const index = elements.findIndex((element) => element === document.activeElement)
    const direction = event.shiftKey ? -1 : 1
    event.preventDefault()
    elements[(index + direction + elements.length) % elements.length]?.focus()
}

onMounted(async () => {
    await nextTick()
    focusSelectedTab()
})
</script>

<template>
    <div
        class="character-backdrop"
        :class="{ 'character-backdrop--reading': tab === 'quests' }"
        @pointerdown.self.prevent.stop
    >
        <section
            ref="panel"
            class="character-window"
            v-bind="$attrs"
            role="dialog"
            :aria-modal="tab !== 'quests' || undefined"
            :aria-label="tGame('game.character.character')"
            tabindex="-1"
            @keydown.capture="panelKey"
        >
            <slot name="frame" />
            <header class="character-header">
                <div>
                    <span class="character-eyebrow">{{
                        tGame('game.character.characterCharacterWindow')
                    }}</span>
                    <h2>{{ nickname }}</h2>
                </div>
                <slot name="close" :button-attrs="closeButtonAttrs">
                    <UiButton v-bind="closeButtonAttrs"><span aria-hidden="true">×</span></UiButton>
                </slot>
            </header>
            <div
                class="character-tabs"
                role="tablist"
                :aria-label="tGame('game.character.characterSections')"
                @keydown="tabKey"
            >
                <template v-for="item in characterTabs" :key="item.id">
                    <slot name="tab" :label="item.label" :button-attrs="tabButtonAttrs(item.id)">
                        <UiButton v-bind="tabButtonAttrs(item.id)" :highlighted="tab === item.id">
                            {{ item.label }}
                        </UiButton>
                    </slot>
                </template>
            </div>
            <div class="character-content">
                <div
                    :key="tab"
                    :id="`character-${tab}-panel`"
                    role="tabpanel"
                    :aria-labelledby="`character-${tab}-tab`"
                >
                    <slot :tab="tab" />
                </div>
            </div>
            <footer v-if="$slots.footer"><slot name="footer" /></footer>
        </section>
    </div>
</template>

<style scoped src="./characterWindowView.css"></style>
