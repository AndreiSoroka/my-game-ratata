import type { ObservedResource, ObservedValue } from '@my-game-ratata/contracts'

function number(value: number): string {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
}

export function observedText(value: ObservedValue, multiplier = 1): string {
    return value.kind === 'exact'
        ? number(value.value * multiplier)
        : `≈${number(value.lower * multiplier)}–${number(value.upper * multiplier)}`
}

export function observedResourceText(resource: ObservedResource): string {
    return resource.hasCapacity
        ? `${observedText(resource.current)} / ${observedText(resource.max)}`
        : 'Нет'
}

export function observedDamageText(damage: { min: ObservedValue; max: ObservedValue }): string {
    const min = damage.min.kind === 'exact' ? damage.min.value : damage.min.lower
    const max = damage.max.kind === 'exact' ? damage.max.value : damage.max.upper
    const approximate = damage.min.kind === 'range' || damage.max.kind === 'range' ? '≈' : ''
    return `${approximate}${number(min)}${min === max ? '' : `–${number(max)}`}`
}
