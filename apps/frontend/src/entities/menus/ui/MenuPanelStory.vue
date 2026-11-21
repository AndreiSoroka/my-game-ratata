<script setup lang="ts">
import { computed, ref } from 'vue'

import { menuKeyboardInput } from '@/shared/lib/input'

import type { MenuPanelHandle, MenuPanelProps } from './menuPanel'
import MenuPanel from './MenuPanel.vue'
import { menuItemsFor } from './menuStoryItems'

const props = withDefaults(defineProps<Partial<MenuPanelProps> & { section?: string }>(), {
    section: 'default',
})
const emit = defineEmits<{ action: [id: string] }>()
const items = computed(() => props.items ?? menuItemsFor(props.section))
const menu = ref<MenuPanelHandle>()
function keydown(event: KeyboardEvent): void {
    menuKeyboardInput(event, (command) => menu.value?.navigate(command) ?? false)
}
</script>

<template>
    <div class="menu-story" :class="{ 'menu-story--overflow': section === 'overflow' }">
        <MenuPanel
            ref="menu"
            tabindex="-1"
            :items="items"
            :title="title"
            :description="description"
            @keydown="keydown"
            @action="emit('action', $event)"
        />
    </div>
</template>

<style scoped>
.menu-story {
    box-sizing: border-box;
    width: min(380px, 100%);
    margin: 0 auto;
}
.menu-story--overflow {
    --menu-panel-max-height: 320px;
}
</style>
