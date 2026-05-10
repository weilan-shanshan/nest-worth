import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/Home.vue'), meta: { title: '总览' } },
  { path: '/assets', name: 'assets', component: () => import('./views/Assets.vue'), meta: { title: '资产' } },
  { path: '/trend', name: 'trend', component: () => import('./views/Trend.vue'), meta: { title: '走势' } },
  { path: '/goals', name: 'goals', component: () => import('./views/Goals.vue'), meta: { title: '目标' } },
  { path: '/settings', name: 'settings', component: () => import('./views/Settings.vue'), meta: { title: '设置' } },
  { path: '/about', name: 'about', component: () => import('./views/About.vue'), meta: { title: '关于' } }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; }
});

export default router;
