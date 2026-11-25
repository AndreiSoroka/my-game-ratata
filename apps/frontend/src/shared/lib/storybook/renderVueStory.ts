import { type Component, createApp, h } from 'vue'

export interface StoryPresentationOptions {
    background?: string
    padding?: string
}

let storySetup: (() => void) | undefined

/** Install Vue providers for components mounted during a Storybook decorator render. */
export function withVueStorySetup<T>(setup: () => void, render: () => T): T {
    const previousSetup = storySetup
    storySetup = setup
    try {
        return render()
    } finally {
        storySetup = previousSetup
    }
}

/** Reuse the production component and release its subscriptions when Storybook removes it. */
export function renderVueStory(
    component: Component,
    props: object,
    presentation: StoryPresentationOptions = {}
): HTMLElement {
    const host = document.createElement('div')
    host.style.cssText = 'position:relative;min-height:520px;box-sizing:border-box'
    host.style.background = presentation.background ?? 'transparent'
    host.style.padding = presentation.padding ?? '24px'
    const setup = storySetup
    const app = setup
        ? createApp({
              setup() {
                  setup()
                  return () => h(component, props)
              },
          })
        : createApp(component, { ...props })
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
