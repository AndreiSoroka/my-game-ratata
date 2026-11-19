let nextFilterInstance = 0

/** Vue apps rendered together in Storybook Docs share this module. */
export function createFantasyDividerFilterId(): string {
    return `fantasy-divider-filter-${nextFilterInstance++}`
}
