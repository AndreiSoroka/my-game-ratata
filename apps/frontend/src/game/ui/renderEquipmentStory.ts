import './interfaceStory.css'

import {
    draggedItem,
    equip,
    EQUIPMENT_ORDER,
    type EquipmentItem,
    type EquipmentSlotId,
    type EquipmentState,
    fits,
    renderItem,
    section,
    SLOT_META,
    slotText,
    socket,
    STARTING_EQUIPMENT,
    STARTING_INVENTORY,
    unequip,
} from './equipmentStoryModel'

export function renderEquipmentStory(): HTMLElement {
    const root = document.createElement('main')
    root.className = 'ratata-equipment-layout'
    root.dataset.interfaceReady = 'true'

    const equipment = { ...STARTING_EQUIPMENT }
    const inventory = new Map(STARTING_INVENTORY.map((item) => [item.slot ?? 0, { ...item }]))
    let selectedSlot: number | undefined

    const equipmentPanel = section('ratata-ui-panel ratata-equipment', 'Character equipment')
    const title = document.createElement('h2')
    title.className = 'ratata-equipment__title'
    title.textContent = 'Equipped'

    const doll = document.createElement('div')
    doll.className = 'ratata-equipment__doll'
    const avatar = document.createElement('div')
    avatar.className = 'ratata-equipment__avatar'
    avatar.setAttribute('aria-hidden', 'true')

    const inventoryPanel = renderInventoryPanel()
    const header = inventoryPanel.querySelector('.ratata-inventory__header')
    const counter = inventoryPanel.querySelector('.ratata-inventory__counter')
    const grid = inventoryPanel.querySelector('.ratata-inventory__grid')
    const status = inventoryPanel.querySelector('.ratata-equipment__status')

    if (
        header === null ||
        counter === null ||
        grid === null ||
        status === null ||
        !(counter instanceof HTMLElement) ||
        !(grid instanceof HTMLElement) ||
        !(status instanceof HTMLElement)
    ) {
        return root
    }

    const render = () => {
        doll.replaceChildren()
        grid.replaceChildren()
        for (const slotId of EQUIPMENT_ORDER) {
            doll.append(
                renderEquipmentSlot({
                    equipment,
                    inventory,
                    onChange: render,
                    selectedSlot,
                    setSelectedSlot: (slot) => {
                        selectedSlot = slot
                    },
                    slotId,
                    status,
                })
            )
        }
        doll.append(avatar)
        for (let index = 0; index < 50; index += 1) {
            grid.append(
                renderInventorySlot({
                    index,
                    inventory,
                    onChange: render,
                    selectedSlot,
                    setSelectedSlot: (slot) => {
                        selectedSlot = slot
                    },
                    status,
                })
            )
        }
        counter.textContent = `${inventory.size}/50`
    }

    equipmentPanel.append(title, doll)
    render()
    root.append(equipmentPanel, inventoryPanel)

    return root
}

function renderInventoryPanel(): HTMLElement {
    const panel = section(
        'ratata-ui-panel ratata-inventory ratata-equipment-inventory',
        'Equipment inventory'
    )
    const header = document.createElement('header')
    header.className = 'ratata-inventory__header'
    const title = document.createElement('h2')
    title.className = 'ratata-inventory__title'
    title.textContent = 'Inventory'
    const counter = document.createElement('span')
    counter.className = 'ratata-inventory__counter'
    const grid = document.createElement('div')
    grid.className = 'ratata-inventory__grid'
    grid.setAttribute('aria-label', 'Inventory slots')
    const status = document.createElement('p')
    status.className = 'ratata-equipment__status'
    status.setAttribute('aria-live', 'polite')

    header.append(title, counter)
    panel.append(header, grid, status)
    return panel
}

function renderEquipmentSlot(options: {
    equipment: EquipmentState
    inventory: Map<number, EquipmentItem>
    onChange: () => void
    selectedSlot: number | undefined
    setSelectedSlot: (slot: number | undefined) => void
    slotId: EquipmentSlotId
    status: HTMLElement
}): HTMLElement {
    const { equipment, inventory, onChange, selectedSlot, setSelectedSlot, slotId, status } =
        options
    const item = equipment[slotId]
    const selectedItem = selectedSlot === undefined ? undefined : inventory.get(selectedSlot)
    const button = document.createElement('button')
    button.className = 'ratata-equipment-slot'
    button.classList.toggle(
        'ratata-equipment-slot--compatible',
        selectedItem !== undefined && fits(selectedItem, slotId)
    )
    button.type = 'button'
    button.dataset.equipmentSlot = slotId
    button.setAttribute('aria-label', `${SLOT_META[slotId].label}: ${item?.name ?? 'empty'}`)
    button.append(
        slotText('short', SLOT_META[slotId].shortLabel),
        socket(item),
        slotText('label', SLOT_META[slotId].label)
    )
    wireEquipmentSlot({
        button,
        equipment,
        inventory,
        onChange,
        selectedSlot,
        setSelectedSlot,
        slotId,
        status,
    })
    return button
}

function wireEquipmentSlot(options: {
    button: HTMLElement
    equipment: EquipmentState
    inventory: Map<number, EquipmentItem>
    onChange: () => void
    selectedSlot: number | undefined
    setSelectedSlot: (slot: number | undefined) => void
    slotId: EquipmentSlotId
    status: HTMLElement
}): void {
    const {
        button,
        equipment,
        inventory,
        onChange,
        selectedSlot,
        setSelectedSlot,
        slotId,
        status,
    } = options
    button.addEventListener('dragover', (event) => {
        const dragged = draggedItem(event, inventory)
        if (dragged !== undefined && fits(dragged.item, slotId)) event.preventDefault()
    })
    button.addEventListener('drop', (event) => {
        const dragged = draggedItem(event, inventory)
        if (dragged === undefined) return
        event.preventDefault()
        equip(dragged.slot, slotId, inventory, equipment, status)
        setSelectedSlot(undefined)
        onChange()
    })
    button.addEventListener('click', () => {
        if (selectedSlot !== undefined) {
            equip(selectedSlot, slotId, inventory, equipment, status)
            setSelectedSlot(undefined)
        } else {
            unequip(slotId, inventory, equipment, status)
        }
        onChange()
    })
}

function renderInventorySlot(options: {
    index: number
    inventory: Map<number, EquipmentItem>
    onChange: () => void
    selectedSlot: number | undefined
    setSelectedSlot: (slot: number | undefined) => void
    status: HTMLElement
}): HTMLElement {
    const { index, inventory, onChange, selectedSlot, setSelectedSlot, status } = options
    const item = inventory.get(index)
    const button = document.createElement('button')
    button.className = 'ratata-inventory__slot'
    button.classList.toggle('ratata-inventory__slot--selected', selectedSlot === index)
    button.type = 'button'
    button.dataset.slot = String(index)
    button.setAttribute('aria-label', item === undefined ? `Empty slot ${index + 1}` : item.name)

    if (item === undefined) return button
    button.draggable = true
    button.append(renderItem(item))
    button.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', String(index))
    })
    button.addEventListener('click', () => {
        setSelectedSlot(selectedSlot === index ? undefined : index)
        status.textContent = item.equipSlots === undefined ? '' : item.name
        onChange()
    })
    return button
}
