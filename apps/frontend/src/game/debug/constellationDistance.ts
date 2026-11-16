const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const plural = new Intl.PluralRules('ru-RU')

function cells(value: number): string {
    const unit = { one: 'клетка', few: 'клетки', many: 'клеток', other: 'клетки' }[
        plural.select(value) as 'one' | 'few' | 'many' | 'other'
    ]
    return `${number.format(value)} ${unit}`
}

/** Display only: base pixels and learned cell bonuses retain their simulation units. */
export function constellationDistance(
    base: number,
    bonusCells: number,
    tileWidth: number | undefined
): string {
    if (tileWidth !== undefined && Number.isFinite(tileWidth) && tileWidth > 0)
        return cells(base / tileWidth + bonusCells)
    return `${number.format(base)} px${bonusCells === 0 ? '' : ` + ${cells(bonusCells)}`}`
}
