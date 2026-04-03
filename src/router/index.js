import { createRouter, createWebHistory } from 'vue-router'
import Home from '../components/Home.vue'
import Play from '../views/Play.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home
  },
  {
    path: '/play',
    name: 'play',
    component: Play
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router