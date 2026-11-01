/** Navigate back when history exists; otherwise return to the app's main route. */
type RouterWithHistory = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: any) => void;
};

export function safeBack(router: RouterWithHistory, fallback: any = '/') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
