import './assets/main.css'
import './assets/app.css'

import { createApp } from 'vue'

async function bootstrap(): Promise<void> {
    if (new URLSearchParams(window.location.search).get('debug') === 'constellations') {
        const { default: ConstellationDebug } = await import('./game/debug/ConstellationDebug.vue')
        createApp(ConstellationDebug).mount('#app')
        return
    }
    const [{ default: App }, { createPinia }, { ensureExcaliburCanvasFlags }] = await Promise.all([
        import('./App.vue'),
        import('pinia'),
        import('./game/runtime/excaliburFlags'),
    ])
    ensureExcaliburCanvasFlags()
    createApp(App).use(createPinia()).mount('#app')
}

void bootstrap()
