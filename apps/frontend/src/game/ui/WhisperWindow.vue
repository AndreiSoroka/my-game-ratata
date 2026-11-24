<script setup lang="ts">
import type { ClientMessage, WhisperSnapshot } from '@my-game-ratata/contracts'

import { characterName, tGame } from '@/shared/lib/i18n'

import PrivateConversation from './PrivateConversation.vue'
import SocialWindow from './SocialWindow.vue'

defineProps<{ conversation: WhisperSnapshot; playerId: string }>()
const emit = defineEmits<{ close: []; command: [message: ClientMessage] }>()
</script>
<template>
    <SocialWindow
        :title="
            tGame('game.chat.privateTitle', {
                name: characterName(conversation.partnerId, conversation.partnerName),
            })
        "
        @close="emit('close')"
    >
        <PrivateConversation
            :conversation="conversation"
            :player-id="playerId"
            @command="emit('command', $event)"
        />
    </SocialWindow>
</template>
