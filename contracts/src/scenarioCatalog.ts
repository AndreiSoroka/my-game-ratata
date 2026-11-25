import type { ScenarioAbilityId } from './scenarios'
export const scenarioTemplates = [
    {
        id: 'lumberjack',
        name: { ru: 'Лесоруб', en: 'Lumberjack' },
        description: {
            ru: 'Срубить древесину и отнести добытое в сундук.',
            en: 'Cut wood and deliver it to a chest.',
        },
        requirements: {
            ru: 'Топор, метки рощи и склада',
            en: 'Axe, grove and storage markers',
        },
    },
    {
        id: 'miner',
        name: { ru: 'Каменщик', en: 'Miner' },
        description: {
            ru: 'Добыть камень или лом и разгрузить сумку.',
            en: 'Mine stone or scrap and unload your bag.',
        },
        requirements: {
            ru: 'Кирка, метки месторождения и склада',
            en: 'Pickaxe, worksite and storage markers',
        },
    },
    {
        id: 'farmer',
        name: { ru: 'Фермер', en: 'Farmer' },
        description: {
            ru: 'Засеять свободную грядку и убрать созревший урожай.',
            en: 'Sow an empty plot and harvest ripe crops.',
        },
        requirements: {
            ru: 'Семена, выбранная грядка и метки подхода и склада',
            en: 'Seeds, a plot, and farm and storage markers',
        },
    },
    {
        id: 'patrol',
        name: { ru: 'Патруль', en: 'Patrol' },
        description: {
            ru: 'Обойти личные метки с паузами.',
            en: 'Visit personal markers and pause at each.',
        },
        requirements: { ru: 'Две личные метки', en: 'Two personal markers' },
    },
    {
        id: 'retreat',
        name: { ru: 'Отступление с прикрытием', en: 'Covered retreat' },
        description: {
            ru: 'Уйти в укрытие при появлении видимого врага.',
            en: 'Retreat when you see an enemy.',
        },
        requirements: {
            ru: 'Метка укрытия, при желании защитное умение',
            en: 'Shelter marker and optional defensive ability',
        },
    },
    {
        id: 'follow',
        name: {
            ru: 'Следовать за дружественным персонажем',
            en: 'Follow a friendly character',
        },
        description: {
            ru: 'Следовать за ближайшим видимым другом, когда ещё ни за кем не следуешь.',
            en: 'Follow the nearest visible friend if you are not following anyone.',
        },
        requirements: {
            ru: 'Видимый дружественный персонаж поблизости',
            en: 'Visible friendly character nearby',
        },
    },
] as const

export type ScenarioTemplateId = (typeof scenarioTemplates)[number]['id']
export interface ScenarioTemplateParameters {
    workMarkerId?: string
    storageMarkerId?: string
    shelterMarkerId?: string
    secondMarkerId?: string
    plotId?: string
    plotLocationId?: string
    amount?: number
    resource?: 'stone' | 'scrap'
    distanceTiles?: number
    dash?: boolean
    abilityId?: ScenarioAbilityId
}
