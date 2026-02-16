import {RouteLocationNormalizedLoadedGeneric} from 'vue-router';


/**
 * 反回完整路由
 */
const routeFullPath = (route: RouteLocationNormalizedLoadedGeneric): string => {
  return route.matched.map((m) => m.path).join('');
};

/**
 * 检查路由前缀
 */
const checkRouterPrefix = (routerPrefix: string, route: RouteLocationNormalizedLoadedGeneric): boolean => {
  const fullPath = routeFullPath(route);
  return fullPath.startsWith(routerPrefix);
};

/**
 * 检查路由后缀
 */
const checkRouterSuffix = (routerPrefix: string, route: RouteLocationNormalizedLoadedGeneric): boolean => {
  const fullPath = routeFullPath(route);
  return fullPath.endsWith(routerPrefix);
};

/**
 * 包含路由路径
 * @param routerName
 * @param route
 */
const includesRoute = (routerName: string, route: RouteLocationNormalizedLoadedGeneric): boolean => {
  const fullPath = routeFullPath(route);
  return fullPath.includes(routerName);
};

export {
  routeFullPath,
  checkRouterPrefix,
  checkRouterSuffix,
  includesRoute,
};
