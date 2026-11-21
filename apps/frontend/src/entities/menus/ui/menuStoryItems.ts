import type { MenuItem } from '../model/menu'

export const menuStoryItems: readonly MenuItem[] = [
    { id: 'resume', label: 'Вернуться в игру', variant: 'primary' },
    { id: 'character', label: 'Персонаж', key: 'P' },
    { id: 'markers', label: 'Метки' },
    { id: 'scenarios', label: 'Сценарии' },
    { id: 'sound', label: 'Звук: включён', pressed: false },
    { id: 'leave', label: 'Выйти из игры', variant: 'danger', dividerBefore: true },
]

export function menuItemsFor(section: string): readonly MenuItem[] {
    if (section === 'disabled')
        return menuStoryItems.map((item) => ({
            ...item,
            disabled: item.id === 'character' || item.id === 'sound',
            hint: item.id === 'character' ? 'Этот пункт сейчас недоступен.' : undefined,
        }))
    if (section === 'long-labels')
        return menuStoryItems.map((item) => ({
            ...item,
            label:
                item.id === 'character'
                    ? 'Персонаж с очень длинным именем'
                    : item.id === 'scenarios'
                      ? 'Сценарии путешествий по землям Новогорода'
                      : item.label,
        }))
    if (section === 'overflow')
        return [
            ...menuStoryItems,
            ...Array.from({ length: 12 }, (_, index) => ({
                id: `extra-${index}`,
                label: `Дополнительный пункт ${index + 1}`,
            })),
        ]
    return menuStoryItems
}
