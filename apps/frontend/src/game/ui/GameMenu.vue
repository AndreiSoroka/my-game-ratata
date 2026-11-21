<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { type MenuItem, MenuPanel, type MenuPanelHandle } from '@/entities/menus'
import { menuKeyboardInput } from '@/shared/lib/input'

import {
    isAudioMuted,
    isAudioMuteForced,
    setAudioMuted,
    subscribeAudioMute,
} from '../runtime/audioPreference'
import { useEscapeOwner } from './uiEscapeOwners'

const props = withDefaults(
    defineProps<{ automationAvailable?: boolean; inventoryAvailable?: boolean }>(),
    { automationAvailable: true, inventoryAvailable: true }
)
const emit = defineEmits<{
    resume: []
    leave: []
    character: []
    inventory: []
    markers: []
    scenarios: []
}>()
const panel = ref<HTMLElement>()
const menu = ref<MenuPanelHandle>()
const muted = ref(isAudioMuted())
const forcedMute = isAudioMuteForced()
const items = computed<readonly MenuItem[]>(() => [
    { id: 'resume', label: 'Вернуться в игру', variant: 'primary' },
    { id: 'character', label: 'Персонаж', key: 'P', disabled: !props.automationAvailable },
    { id: 'inventory', label: 'Инвентарь', key: 'I', disabled: !props.inventoryAvailable },
    { id: 'markers', label: 'Метки', disabled: !props.automationAvailable },
    { id: 'scenarios', label: 'Сценарии', disabled: !props.automationAvailable },
    {
        id: 'sound',
        label: `Звук: ${muted.value ? 'выключен' : 'включён'}`,
        ariaLabel: 'Без звука',
        pressed: muted.value,
        disabled: forcedMute,
    },
    { id: 'leave', label: 'Выйти из игры', variant: 'danger', dividerBefore: true },
])
function activate(id: string): void {
    if (id === 'sound') {
        if (!forcedMute) setAudioMuted(!muted.value)
        return
    }
    switch (id) {
        case 'resume':
            emit('resume')
            break
        case 'leave':
            emit('leave')
            break
        case 'character':
            emit('character')
            break
        case 'inventory':
            emit('inventory')
            break
        case 'markers':
            emit('markers')
            break
        case 'scenarios':
            emit('scenarios')
            break
    }
}
const unsubscribeAudio = subscribeAudioMute((value) => {
    muted.value = value
})
onBeforeUnmount(unsubscribeAudio)
useEscapeOwner({ active: () => true, escape: () => emit('resume'), element: panel, priority: 200 })
function keydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault()
        if (!event.repeat) emit('resume')
        return
    }
    if (
        event.code === 'KeyI' &&
        !event.isComposing &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
    ) {
        event.preventDefault()
        if (!event.repeat && props.inventoryAvailable) activate('inventory')
        return
    }
    menuKeyboardInput(event, (command) => menu.value?.navigate(command) ?? false)
}
onMounted(async () => {
    await nextTick()
    menu.value?.navigate('first')
})
</script>

<template>
    <div class="game-menu-backdrop" @pointerdown.self.prevent.stop @click.self.stop>
        <section
            ref="panel"
            class="game-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Игровое меню"
            tabindex="-1"
            @keydown.stop="keydown"
            @keyup.stop
        >
            <MenuPanel ref="menu" :items="items" @action="activate" />
        </section>
    </div>
</template>

<style scoped>
.game-menu-backdrop {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 16px;
    background: #0b151ab3;
}
.game-menu {
    --menu-panel-max-height: calc(100dvh - 32px);
    box-sizing: border-box;
    width: min(380px, 100%);
    max-height: calc(100dvh - 32px);
    min-width: 0;
}
</style>
