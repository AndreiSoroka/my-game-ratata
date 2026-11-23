import './assets/main.css'
import './assets/app.css'

import { createApp } from 'vue'

import { gameI18n, initializeGameLocale } from '@/shared/lib/i18n'

async function bootstrap(): Promise<void> {
    initializeGameLocale()
    if (new URLSearchParams(window.location.search).get('debug') === 'constellations') {
        const { default: ConstellationDebug } = await import('./game/debug/ConstellationDebug.vue')
        createApp(ConstellationDebug).use(gameI18n).mount('#app')
        return
    }
    const [{ default: App }, { createPinia }, { ensureExcaliburCanvasFlags }] = await Promise.all([
        import('./App.vue'),
        import('pinia'),
        import('./game/runtime/excaliburFlags'),
    ])
    ensureExcaliburCanvasFlags()
    createApp(App).use(createPinia()).use(gameI18n).mount('#app')
}

void bootstrap()
