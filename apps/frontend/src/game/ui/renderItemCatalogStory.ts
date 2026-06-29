import './interfaceStory.css'

import { ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import { itemAssetList } from '../assets/itemCatalog'

export function renderItemCatalogStory(): HTMLElement {
    const root = document.createElement('section')
    root.className = 'ratata-ui-panel ratata-item-catalog'
    root.dataset.interfaceReady = 'true'
    root.setAttribute('aria-label', 'Item catalog')

    const title = document.createElement('h2')
    title.className = 'ratata-item-catalog__title'
    title.textContent = 'Item Catalog'

    const grid = document.createElement('div')
    grid.className = 'ratata-item-catalog__grid'

    for (const item of itemAssetList) {
        const entry = document.createElement('article')
        entry.className = 'ratata-item-catalog__entry'

        const image = document.createElement('img')
        image.className = 'ratata-item-catalog__icon'
        image.src = item.src
        image.alt = item.label

        const code = document.createElement('code')
        code.textContent = item.id

        const name = document.createElement('span')
        name.textContent = ITEM_DEFINITIONS[item.id].name

        entry.append(image, code, name)
        grid.append(entry)
    }

    root.append(title, grid)

    return root
}
