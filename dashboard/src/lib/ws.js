export function getWebSocketUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const override = import.meta.env.VITE_WS_URL;
  if (override) {
    const base = override.replace(/\/+$/, '');
    return `${base}${normalizedPath}`;
  }

  const apiBase = import.meta.env.VITE_API_URL;
  if (apiBase && apiBase.startsWith('http')) {
    const url = new URL(apiBase);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = normalizedPath;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalizedPath}`;
}
