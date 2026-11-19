import type { Component } from 'vue'

import { renderVueStory as renderSharedVueStory } from '@/shared/lib/storybook'

/** Preserve the legacy game stories while Shared previews use the canvas background. */
export function renderVueStory(component: Component, props: Record<string, unknown>): HTMLElement {
    return renderSharedVueStory(component, props, { background: '#354137' })
}
