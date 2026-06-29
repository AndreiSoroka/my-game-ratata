import './interfaceStory.css'

export type ChestState = 'closed' | 'open'

interface InventoryItem {
    id: string
    name: string
    quantity?: number
    sprite: {
        position: string
        src: string
    }
}

interface InventorySlot extends InventoryItem {
    slot: number
}

const TILESET_ROOT = '/game/map/assets/MysticWoods'
const CHEST_SPRITE = `${TILESET_ROOT}/objects/chest_01.png`

const STARTING_ITEMS: InventorySlot[] = [
    createSlotItem(0, 'mushroom', 'Mooncap', `${TILESET_ROOT}/tilesets/decor_16x16.png`, '0 0', 3),
    createSlotItem(1, 'herb', 'River herb', `${TILESET_ROOT}/tilesets/decor_16x16.png`, '-16px 0'),
    createSlotItem(
        7,
        'wood',
        'Fence wood',
        `${TILESET_ROOT}/tilesets/fences.png`,
        '-32px -16px',
        6
    ),
    createSlotItem(
        13,
        'cloth',
        'Travel cloth',
        `${TILESET_ROOT}/tilesets/floors/carpet.png`,
        '-48px -32px'
    ),
    createSlotItem(
        24,
        'stone',
        'Old stone',
        `${TILESET_ROOT}/objects/objects.png`,
        '-16px -16px',
        2
    ),
]

const LOOT_ITEMS: InventoryItem[] = [
    createItem(
        'berry',
        'Wild berries',
        `${TILESET_ROOT}/tilesets/decor_16x16.png`,
        '-32px -16px',
        4
    ),
    createItem(
        'reed',
        'Water reed',
        `${TILESET_ROOT}/tilesets/water_decorations.png`,
        '-16px -16px'
    ),
    createItem('plank', 'Oak plank', `${TILESET_ROOT}/tilesets/floors/wooden.png`, '-32px 0'),
]

export function renderInventoryStory(): HTMLElement {
    const panel = document.createElement('section')
    panel.className = 'ratata-ui-panel ratata-inventory'
    panel.dataset.interfaceReady = 'true'
    panel.setAttribute('aria-label', 'Inventory')

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

    const tray = document.createElement('div')
    tray.className = 'ratata-inventory__tray'

    const dropped = document.createElement('div')
    dropped.className = 'ratata-inventory__dropped'
    dropped.setAttribute('aria-live', 'polite')

    const slots = new Map(STARTING_ITEMS.map((item) => [item.slot, { ...item }]))
    const render = () => renderInventorySlots({ counter, dropped, grid, slots, tray })

    header.append(title, counter)
    render()
    panel.append(header, grid, tray, dropped)

    return panel
}

export function renderChestStory(state: ChestState): HTMLElement {
    const root = document.createElement('section')
    root.className = 'ratata-ui-panel ratata-chest-card'
    root.dataset.interfaceReady = 'true'
    root.setAttribute('aria-label', state === 'open' ? 'Open chest' : 'Closed chest')

    const chest = document.createElement('span')
    chest.className = `ratata-chest-sprite ratata-chest-sprite--${state}`
    chest.style.backgroundImage = `url("${CHEST_SPRITE}")`
    chest.setAttribute('role', 'img')
    chest.setAttribute('aria-label', state === 'open' ? 'Open chest' : 'Closed chest')

    const label = document.createElement('strong')
    label.className = 'ratata-chest-card__label'
    label.textContent = state === 'open' ? 'Open chest' : 'Closed chest'

    root.append(chest, label)

    return root
}

function renderInventorySlots({
    counter,
    dropped,
    grid,
    slots,
    tray,
}: {
    counter: HTMLElement
    dropped: HTMLElement
    grid: HTMLElement
    slots: Map<number, InventorySlot>
    tray: HTMLElement
}): void {
    grid.replaceChildren()
    tray.replaceChildren()

    for (let index = 0; index < 50; index += 1) {
        const slot = renderInventorySlot(index, slots, dropped, () =>
            renderInventorySlots({ counter, dropped, grid, slots, tray })
        )
        grid.append(slot)
    }

    for (const item of LOOT_ITEMS) {
        tray.append(
            renderLootItem(item, slots, () =>
                renderInventorySlots({ counter, dropped, grid, slots, tray })
            )
        )
    }

    counter.textContent = `${slots.size}/50`
}

function renderInventorySlot(
    index: number,
    slots: Map<number, InventorySlot>,
    dropped: HTMLElement,
    onChange: () => void
): HTMLElement {
    const slot = document.createElement('button')
    const item = slots.get(index)
    slot.className = 'ratata-inventory__slot'
    slot.type = 'button'
    slot.dataset.slot = String(index)
    slot.setAttribute('aria-label', item === undefined ? `Empty slot ${index + 1}` : item.name)

    if (item !== undefined) {
        slot.append(renderItem(item))
        slot.addEventListener('click', () => {
            slots.delete(index)
            dropped.replaceChildren(renderDroppedItem(item))
            onChange()
        })
    }

    return slot
}

function renderLootItem(
    item: InventoryItem,
    slots: Map<number, InventorySlot>,
    onChange: () => void
): HTMLElement {
    const button = document.createElement('button')
    button.className = 'ratata-inventory__loot'
    button.type = 'button'
    button.setAttribute('aria-label', item.name)
    button.append(renderItem(item))
    button.addEventListener('click', () => {
        const slot = firstEmptySlot(slots)

        if (slot === undefined) {
            return
        }

        slots.set(slot, { ...item, id: `${item.id}-${Date.now()}`, slot })
        onChange()
    })

    return button
}

function createSlotItem(
    slot: number,
    id: string,
    name: string,
    src: string,
    position: string,
    quantity?: number
): InventorySlot {
    return {
        ...createItem(id, name, src, position, quantity),
        slot,
    }
}

function createItem(
    id: string,
    name: string,
    src: string,
    position: string,
    quantity?: number
): InventoryItem {
    return {
        id,
        name,
        quantity,
        sprite: {
            position,
            src,
        },
    }
}

function renderItem(item: InventoryItem): HTMLElement {
    const icon = document.createElement('span')
    icon.className = 'ratata-inventory-item'
    icon.style.backgroundImage = `url("${item.sprite.src}")`
    icon.style.backgroundPosition = item.sprite.position

    if (item.quantity !== undefined && item.quantity > 1) {
        const quantity = document.createElement('span')
        quantity.className = 'ratata-inventory-item__quantity'
        quantity.textContent = String(item.quantity)
        icon.append(quantity)
    }

    return icon
}

function renderDroppedItem(item: InventoryItem): HTMLElement {
    const chip = document.createElement('span')
    chip.className = 'ratata-inventory__drop-chip'
    chip.append(renderItem(item))

    return chip
}

function firstEmptySlot(slots: Map<number, InventorySlot>): number | undefined {
    for (let index = 0; index < 50; index += 1) {
        if (!slots.has(index)) {
            return index
        }
    }

    return undefined
}
