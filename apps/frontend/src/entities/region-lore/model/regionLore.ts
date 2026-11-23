import { GRID_SIZE, REGION_NAME } from '@my-game-ratata/contracts'

export interface RegionLoreContent {
    regionName: string
    locationCount: number
    headingFirstLine: string
    headingSecondLine: string
    description: string
    invitation: string
}

export const regionLoreContent: RegionLoreContent = {
    regionName: REGION_NAME,
    locationCount: GRID_SIZE * GRID_SIZE,
    headingFirstLine: 'Новогород',
    headingSecondLine: 'и дальние земли',
    description:
        'Почему твоя Искра пробудилась именно в этом теле, погребённом у часовни Новогорода? Расспроси жителей о прежних жизнях и найди попутчика, чтобы вместе выйти за городские ворота.',
    invitation:
        'Искра живёт в персонаже, пока с ним связан разум. Эхо следует привычкам и повторяет знакомые дела. Собирайте свои сценарии и договаривайтесь о помощи.',
}

const locationCountRules = new Intl.PluralRules('ru')
const locationCountNouns: Partial<Record<Intl.LDMLPluralRule, string>> = {
    one: 'ЛОКАЦИЯ',
    few: 'ЛОКАЦИИ',
    other: 'ЛОКАЦИИ',
}

export function formatLocationCount(count: number): string {
    const noun = locationCountNouns[locationCountRules.select(count)] ?? 'ЛОКАЦИЙ'
    return `${count} ${noun}`
}
