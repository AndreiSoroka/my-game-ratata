let nextFilterInstance = 0

/** Multiple Vue apps can coexist in Storybook Docs and share this module. */
export function createFantasyPanelFilterId(): string {
    return `fantasy-panel-filter-${nextFilterInstance++}`
}
