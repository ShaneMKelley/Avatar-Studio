export function getProxyUrl(url: string | undefined): string {
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  
  // GCS assets support CORS perfectly and can be loaded directly in the browser
  if (url.includes('storage.googleapis.com')) return url;
  
  // If it's already a proxied URL, don't double proxy
  if (url.includes('/api/proxy-vrm')) return url;
  return `/api/proxy-vrm?url=${encodeURIComponent(url)}`;
}
