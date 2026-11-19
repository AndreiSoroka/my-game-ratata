let nextFilterInstance = 0

/** Multiple Vue apps can coexist in Storybook Docs and share this module. */
export function createFantasyBorderFilterId(): string {
    return `fantasy-border-filter-${nextFilterInstance++}`
}
