const cellNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
const cellPlural = new Intl.PluralRules('ru-RU', { maximumFractionDigits: 2 })

export function interactionRangeText(
    pixels: number,
    tileWidth?: number
): string {
    if (
        tileWidth === undefined ||
        !Number.isFinite(tileWidth) ||
        tileWidth <= 0
    ) {
        return 'поблизости'
    }
    const cells = pixels / tileWidth
    const plural = cellPlural.select(cells)
    const unit = plural === 'one' || plural === 'other' ? 'клетки' : 'клеток'
    return `на расстоянии до ${cellNumber.format(cells)} ${unit}`
}
