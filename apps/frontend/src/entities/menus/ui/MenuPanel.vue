<script setup lang="ts">
import './menuPanel.css'

import { useId } from 'vue'

import { UiButton } from '@/shared/ui/common'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { lightUiColors } from '@/shared/ui/theme'

import type { MenuItem, MenuPanelHandle, MenuPanelProps } from '../model/menu'
import { useMenuHighlight } from './useMenuHighlight'
import { useMenuNavigation } from './useMenuNavigation'

const props = withDefaults(defineProps<MenuPanelProps>(), {
    title: 'Игровое меню',
    description: 'Мир продолжает жить, пока открыто меню.',
})
const emit = defineEmits<{ action: [id: string] }>()
const instanceId = useId()
const highlight = useMenuHighlight(() => props.items)
const { root, highlighted } = highlight
const navigation = useMenuNavigation(root, () => props.items, highlight.takeControl)
defineExpose<MenuPanelHandle>(navigation)
function activate(item: MenuItem): void {
    if (!item.disabled) emit('action', item.id)
}
function hintId(index: number): string {
    return `${instanceId}-menu-hint-${index}`
}
</script>

<template>
    <div
        ref="root"
        class="menu-panel"
        @keydown.capture="highlight.keyboard"
        @pointerdown.capture="highlight.pointerDown"
        @focusin="highlight.focus"
        @focusout="highlight.blur"
    >
        <FantasyBorder
            border="border-015"
            :color="lightUiColors.border.wood"
            class="menu-panel__outer"
        >
            <FantasyBorder
                border="border-014"
                :color="lightUiColors.border.wood"
                class="menu-panel__inner"
            >
                <div class="menu-panel__scroll">
                    <header class="menu-panel__header">
                        <h2>{{ title }}</h2>
                        <p v-if="description">{{ description }}</p>
                    </header>
                    <nav
                        class="menu-panel__actions"
                        :aria-label="title"
                        @pointerenter="highlight.pointerEnter"
                        @pointermove="highlight.pointerMove"
                        @pointerleave="highlight.pointerLeave"
                        @pointercancel="highlight.reset"
                    >
                        <div v-for="(item, index) in items" :key="item.id" class="menu-panel__item">
                            <FantasyDivider
                                v-if="item.dividerBefore"
                                divider="divider-000"
                                ends="both"
                                :fade="false"
                                :color="lightUiColors.border.wood"
                                class="menu-panel__divider"
                            />
                            <UiButton
                                appearance="ghost"
                                border="border-026"
                                :focus-ring="false"
                                :variant="item.variant"
                                :disabled="item.disabled"
                                :highlighted="highlighted === item.id"
                                :aria-label="item.ariaLabel"
                                :aria-pressed="item.pressed"
                                :aria-describedby="item.hint ? hintId(index) : undefined"
                                :data-dialog-action="item.id"
                                :data-menu-item="item.id"
                                :data-menu-highlighted="highlighted === item.id"
                                @pointerenter="highlight.enterButton($event, item)"
                                @click="activate(item)"
                            >
                                {{ item.label }}{{ item.key ? ` · ${item.key}` : '' }}
                            </UiButton>
                            <p v-if="item.hint" :id="hintId(index)" class="menu-panel__hint">
                                {{ item.hint }}
                            </p>
                        </div>
                    </nav>
                </div>
            </FantasyBorder>
        </FantasyBorder>
    </div>
</template>
