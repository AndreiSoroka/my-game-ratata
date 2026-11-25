import './assets/main.css'
import './assets/app.css'

import { createApp } from 'vue'

import { gameI18n, initializeGameLocale } from '@/shared/lib/i18n'

async function bootstrap(): Promise<void> {
    initializeGameLocale()
    if (new URLSearchParams(window.location.search).get('debug') === 'constellations') {
        const { ConstellationDebug } = await import('@/pages/constellation-debug')
        createApp(ConstellationDebug).use(gameI18n).mount('#app')
        return
    }
    const [{ default: App }, { createPinia }] = await Promise.all([
        import('./app/App.vue'),
        import('pinia'),
    ])
    createApp(App).use(createPinia()).use(gameI18n).mount('#app')
}

void bootstrap()
