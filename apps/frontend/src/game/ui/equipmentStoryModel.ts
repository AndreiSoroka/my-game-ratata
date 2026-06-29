export type EquipmentSlotId = 'boots' | 'chest' | 'head' | 'leftHand' | 'legs' | 'rightHand'
type ItemIcon = 'armor' | 'boots' | 'helmet' | 'legs' | 'shield' | 'sword'

export interface EquipmentItem {
    equipSlots?: EquipmentSlotId[]
    icon?: ItemIcon
    id: string
    name: string
    quantity?: number
    slot?: number
    sprite?: {
        position: string
        src: string
    }
}

export type EquipmentState = Partial<Record<EquipmentSlotId, EquipmentItem>>

const TILESET_ROOT = '/game/map/assets/MysticWoods'

export const SLOT_META: Record<EquipmentSlotId, { label: string; shortLabel: string }> = {
    boots: { label: 'Boots', shortLabel: 'BT' },
    chest: { label: 'Chest', shortLabel: 'CH' },
    head: { label: 'Head', shortLabel: 'HD' },
    leftHand: { label: 'Left hand', shortLabel: 'LH' },
    legs: { label: 'Legs', shortLabel: 'LG' },
    rightHand: { label: 'Right hand', shortLabel: 'RH' },
}

export const EQUIPMENT_ORDER: EquipmentSlotId[] = [
    'head',
    'chest',
    'legs',
    'boots',
    'leftHand',
    'rightHand',
]

export const STARTING_EQUIPMENT: EquipmentState = {
    boots: iconItem('trail-boots', 'Trail Boots', 'boots', ['boots']),
    chest: iconItem('linen-tunic', 'Linen Tunic', 'armor', ['chest']),
}

export const STARTING_INVENTORY: EquipmentItem[] = [
    slotItem(0, 'rusty-sword', 'Rusty Sword', 'sword', ['leftHand', 'rightHand']),
    slotItem(1, 'buckler', 'Buckler', 'shield', ['leftHand', 'rightHand']),
    slotItem(2, 'iron-helm', 'Iron Helm', 'helmet', ['head']),
    slotItem(3, 'wool-trousers', 'Wool Trousers', 'legs', ['legs']),
    spriteSlotItem(10, 'mushroom', 'Mooncap', `${TILESET_ROOT}/tilesets/decor_16x16.png`, '0 0', 3),
]

export function equip(
    inventorySlot: number,
    equipmentSlot: EquipmentSlotId,
    inventory: Map<number, EquipmentItem>,
    equipment: EquipmentState,
    status: HTMLElement
): void {
    const item = inventory.get(inventorySlot)

    if (item === undefined) return
    if (!fits(item, equipmentSlot)) {
        status.textContent = `${item.name} cannot go there`
        return
    }

    const replaced = equipment[equipmentSlot]
    equipment[equipmentSlot] = item
    inventory.delete(inventorySlot)
    if (replaced !== undefined) inventory.set(inventorySlot, { ...replaced, slot: inventorySlot })
    status.textContent = `${item.name} equipped to ${SLOT_META[equipmentSlot].label}`
}

export function unequip(
    slotId: EquipmentSlotId,
    inventory: Map<number, EquipmentItem>,
    equipment: EquipmentState,
    status: HTMLElement
): void {
    const item = equipment[slotId]
    const slot = firstEmptySlot(inventory)

    if (item === undefined || slot === undefined) return
    delete equipment[slotId]
    inventory.set(slot, { ...item, slot })
    status.textContent = `${item.name} moved to inventory`
}

export function renderItem(item: EquipmentItem): HTMLElement {
    const icon = document.createElement('span')
    icon.className = 'ratata-inventory-item'
    if (item.sprite !== undefined) {
        icon.style.backgroundImage = `url("${item.sprite.src}")`
        icon.style.backgroundPosition = item.sprite.position
    }
    if (item.icon !== undefined) icon.classList.add(`ratata-inventory-item--${item.icon}`)
    if (item.quantity !== undefined && item.quantity > 1) icon.append(quantityLabel(item.quantity))

    return icon
}

export function section(className: string, label: string): HTMLElement {
    const element = document.createElement('section')
    element.className = className
    element.setAttribute('aria-label', label)
    return element
}

export function slotText(kind: 'label' | 'short', text: string): HTMLElement {
    const element = document.createElement('span')
    element.className = `ratata-equipment-slot__${kind}`
    element.textContent = text
    return element
}

export function socket(item: EquipmentItem | undefined): HTMLElement {
    const element = document.createElement('span')
    element.className = 'ratata-equipment-slot__socket'
    if (item !== undefined) element.append(renderItem(item))
    return element
}

export function draggedItem(
    event: DragEvent,
    inventory: Map<number, EquipmentItem>
): { item: EquipmentItem; slot: number } | undefined {
    const rawSlot = event.dataTransfer?.getData('text/plain')
    if (rawSlot === undefined || rawSlot === '') return undefined
    const slot = Number(rawSlot)
    const item = inventory.get(slot)
    return item === undefined ? undefined : { item, slot }
}

export function fits(item: EquipmentItem, slot: EquipmentSlotId): boolean {
    return item.equipSlots?.includes(slot) ?? false
}

function iconItem(
    id: string,
    name: string,
    icon: ItemIcon,
    equipSlots: EquipmentSlotId[]
): EquipmentItem {
    return { equipSlots, icon, id, name }
}

function slotItem(
    slot: number,
    id: string,
    name: string,
    icon: ItemIcon,
    equipSlots: EquipmentSlotId[]
): EquipmentItem {
    return { ...iconItem(id, name, icon, equipSlots), slot }
}

function spriteSlotItem(
    slot: number,
    id: string,
    name: string,
    src: string,
    position: string,
    quantity: number
): EquipmentItem {
    return { id, name, quantity, slot, sprite: { position, src } }
}

function quantityLabel(quantityValue: number): HTMLElement {
    const quantity = document.createElement('span')
    quantity.className = 'ratata-inventory-item__quantity'
    quantity.textContent = String(quantityValue)
    return quantity
}

function firstEmptySlot(inventory: Map<number, EquipmentItem>): number | undefined {
    for (let index = 0; index < 50; index += 1) {
        if (!inventory.has(index)) return index
    }
    return undefined
}
