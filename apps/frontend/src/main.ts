import './assets/main.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { ensureExcaliburCanvasFlags } from './game/runtime/excaliburFlags'

ensureExcaliburCanvasFlags()

const app = createApp(App)

app.use(createPinia())

app.mount('#app')
