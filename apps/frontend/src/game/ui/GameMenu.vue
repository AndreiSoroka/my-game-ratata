<script setup lang="ts">
import { isGameLocale } from '@my-game-ratata/contracts'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { type MenuItem, MenuPanel, type MenuPanelHandle } from '@/entities/menus'
import { gameLocale, gameLocaleNames, gameLocales, setGameLocale, tGame } from '@/shared/lib/i18n'
import { menuKeyboardInput } from '@/shared/lib/input'

import {
    isAudioMuted,
    isAudioMuteForced,
    setAudioMuted,
    subscribeAudioMute,
} from '../runtime/audioPreference'
import {
    isNpcVoiceEnabled,
    setNpcVoiceEnabled,
    subscribeNpcVoiceEnabled,
} from '../runtime/npcVoicePreference'
import { gameUiSoundKey } from './gameUiSound'
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
const playUiSound = inject(gameUiSoundKey)
const muted = ref(isAudioMuted())
const forcedMute = isAudioMuteForced()
const npcVoiceEnabled = ref(!forcedMute && isNpcVoiceEnabled())
const items = computed<readonly MenuItem[]>(() => [
    { id: 'resume', label: tGame('game.menu.resume'), variant: 'primary' },
    {
        id: 'character',
        label: tGame('game.menu.character'),
        key: 'P',
        disabled: !props.automationAvailable,
    },
    {
        id: 'inventory',
        label: tGame('game.menu.inventory'),
        key: 'I',
        disabled: !props.inventoryAvailable,
    },
    { id: 'markers', label: tGame('game.menu.markers'), disabled: !props.automationAvailable },
    { id: 'scenarios', label: tGame('game.menu.scenarios'), disabled: !props.automationAvailable },
    {
        id: 'sound',
        label: tGame(muted.value ? 'game.menu.soundOff' : 'game.menu.soundOn'),
        ariaLabel: tGame('game.menu.muted'),
        pressed: muted.value,
        disabled: forcedMute,
    },
    {
        id: 'npc-voice',
        label: tGame(npcVoiceEnabled.value ? 'game.menu.npcVoiceOn' : 'game.menu.npcVoiceOff'),
        ariaLabel: tGame('game.menu.npcVoice'),
        pressed: npcVoiceEnabled.value,
        disabled: forcedMute,
    },
    ...gameLocales.map((locale) => ({
        id: locale,
        label: gameLocaleNames[locale],
        ariaLabel: `${tGame('game.menu.language')}: ${gameLocaleNames[locale]}`,
        pressed: gameLocale.value === locale,
        dividerBefore: locale === 'ru',
    })),
    { id: 'leave', label: tGame('game.menu.leave'), variant: 'danger', dividerBefore: true },
])
function toggleAudio(): void {
    if (forcedMute) return
    const willMute = !muted.value
    setAudioMuted(willMute)
    if (!willMute) playUiSound?.('uiClick')
}
function activate(id: string): void {
    if (isGameLocale(id)) {
        setGameLocale(id)
        return
    }
    if (id === 'sound') {
        toggleAudio()
        return
    }
    if (id === 'npc-voice') {
        if (!forcedMute) setNpcVoiceEnabled(!npcVoiceEnabled.value)
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
const unsubscribeNpcVoice = subscribeNpcVoiceEnabled((value) => {
    npcVoiceEnabled.value = !forcedMute && value
})
onBeforeUnmount(unsubscribeAudio)
onBeforeUnmount(unsubscribeNpcVoice)
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
    menuKeyboardInput(event, (command) => {
        const previous = document.activeElement
        const navigated = menu.value?.navigate(command) ?? false
        if (navigated && command !== 'activate' && document.activeElement !== previous)
            playUiSound?.('uiSelect')
        return navigated
    })
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
            :aria-label="tGame('game.menu.dialog')"
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
