import { type Component, createApp } from 'vue'

export interface StoryPresentationOptions {
    background?: string
    padding?: string
}

/** Reuse the production component and release its subscriptions when Storybook removes it. */
export function renderVueStory(
    component: Component,
    props: Record<string, unknown>,
    presentation: StoryPresentationOptions = {}
): HTMLElement {
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;min-height:520px;box-sizing:border-box'
    host.style.background = presentation.background ?? 'transparent'
    host.style.padding = presentation.padding ?? '24px'
    const app = createApp(component, props)
    app.mount(host)
    let connected = false
    const observer = new MutationObserver(() => {
        if (host.isConnected) connected = true
        else if (connected) {
            app.unmount()
            observer.disconnect()
        }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return host
}
