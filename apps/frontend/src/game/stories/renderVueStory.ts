import { type Component, createApp } from 'vue'

/** Reuse the production component and release its subscriptions when Storybook removes it. */
export function renderVueStory(component: Component, props: Record<string, unknown>): HTMLElement {
    const host = document.createElement('div')
    host.style.cssText =
        'position:relative;min-height:520px;background:#354137;padding:24px;box-sizing:border-box'
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
