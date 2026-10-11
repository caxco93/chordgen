import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { trackEngagementTime } from './analytics'

createApp(App).mount('#app')
trackEngagementTime()
