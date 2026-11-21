<script setup lang="ts">
import { computed } from 'vue'

import {
    ExchangeInvitationNotice,
    type ExchangeInvitationSnapshot,
    projectExchangeInvitation,
} from '@/entities/exchanges'

const props = defineProps<{ exchange: ExchangeInvitationSnapshot | null | undefined }>()
const emit = defineEmits<{
    accept: [exchangeId: string]
    decline: [exchangeId: string]
    cancel: [exchangeId: string]
}>()

const invitation = computed(() => projectExchangeInvitation(props.exchange))
</script>

<template>
    <ExchangeInvitationNotice
        v-if="invitation"
        :direction="invitation.direction"
        :partner-name="invitation.partnerName"
        @accept="emit('accept', invitation.id)"
        @decline="emit('decline', invitation.id)"
        @cancel="emit('cancel', invitation.id)"
    />
</template>
