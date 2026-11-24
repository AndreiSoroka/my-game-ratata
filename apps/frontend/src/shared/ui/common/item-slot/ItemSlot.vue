<script setup lang="ts">
import './itemSlot.css'

import type { ItemSlotProps } from './itemSlotProps'

withDefaults(defineProps<ItemSlotProps>(), { as: 'span', alt: '', size: 'default' })
defineSlots<{ default?: () => unknown }>()
</script>

<template>
    <component
        :is="as"
        class="ui-item-slot"
        :class="{
            'ui-item-slot--compact': size === 'compact',
            'ui-item-slot--selected': selected,
            'ui-item-slot--empty': empty,
            'ui-item-slot--disabled': disabled,
        }"
        :type="as === 'button' ? 'button' : undefined"
        :disabled="as === 'button' ? disabled : undefined"
        :aria-disabled="disabled || undefined"
    >
        <img v-if="src" class="ui-item-slot__image" :src="src" :alt="alt" draggable="false" />
        <slot />
        <b
            v-if="quantity !== undefined && quantity > 1"
            class="ui-item-slot__quantity"
            aria-hidden="true"
            >{{ quantity }}</b
        >
    </component>
</template>
