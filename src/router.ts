import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { trackPageView, installAutoFlush } from './lib/analytics';

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: () => import('./views/Home.vue'), meta: { title: '总览' } },
  { path: '/assets', name: 'assets', component: () => import('./views/Assets.vue'), meta: { title: '资产' } },
  { path: '/trend', name: 'trend', component: () => import('./views/Trend.vue'), meta: { title: '走势' } },
  { path: '/goals', name: 'goals', component: () => import('./views/Goals.vue'), meta: { title: '目标' } },
  { path: '/settings', name: 'settings', component: () => import('./views/Settings.vue'), meta: { title: '设置' } },
  { path: '/about', name: 'about', component: () => import('./views/About.vue'), meta: { title: '关于' } },
  { path: '/setup-key', name: 'setupKey', component: () => import('./views/KeySetup.vue'), meta: { title: '配置 AI' } },
  { path: '/auth/login', name: 'authLogin', component: () => import('./views/Login.vue'), meta: { title: '登录' } },
  { path: '/auth/verify', name: 'authVerify', component: () => import('./views/AuthVerify.vue'), meta: { title: '验证登录' } },
  {
    // 隐藏后台：路径含密码 token，token 在 env 注入；前端不放导航 / sitemap，并 noindex
    path: '/_admin/:token',
    name: 'admin',
    component: () => import('./views/Admin.vue'),
    meta: { title: '后台', noindex: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() { return { top: 0 }; }
});

router.afterEach((to) => {
  // 后台路径里包含 secret，绝对不上报到埋点
  if (typeof to.path === 'string' && to.path.startsWith('/_admin')) return;
  trackPageView(to.path);
});

installAutoFlush();

export default router;
