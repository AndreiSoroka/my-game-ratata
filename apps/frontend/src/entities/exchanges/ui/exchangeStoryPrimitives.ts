import type { ItemInstanceSnapshot } from '@my-game-ratata/contracts'
import { defineComponent, h, type PropType } from 'vue'

import { itemName } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

import type { ExchangePrimitives } from './exchangePrimitives'

const StoryFrame = defineComponent({
    props: { variant: String },
    setup(props) {
        return () =>
            h(FantasyBorder, {
                as: 'span',
                border: props.variant === 'inset' ? 'border-008' : 'border-017',
                color: 'var(--ui-dark-panel-border)',
                'aria-hidden': 'true',
                style: { position: 'absolute', inset: '0', pointerEvents: 'none' },
            })
    },
})

const StoryItemIcon = defineComponent({
    props: {
        item: { type: Object as PropType<ItemInstanceSnapshot>, required: true },
        showQuantity: Boolean,
    },
    setup(props) {
        return () => {
            const quantity = props.item.quantity ?? 1
            const name = itemName(props.item.itemId)
            const label = quantity > 1 ? `${name} × ${quantity}` : name

            return h(ItemSlot, {
                src: itemAssetCatalog[props.item.itemId].src,
                alt: label,
                title: label,
                quantity: props.showQuantity ? quantity : undefined,
                style: { flex: '0 0 40px' },
            })
        }
    },
})

export const exchangeStoryPrimitives = {
    button: UiButton,
    frame: StoryFrame,
    itemIcon: StoryItemIcon,
} satisfies ExchangePrimitives
