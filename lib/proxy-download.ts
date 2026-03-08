export function getProxyDownloadUrl(url: string, filename?: string): string {
  if (!url) {
    return url;
  }

  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/')) {
    return url;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return parsed.toString();
    }

    const searchParams = new URLSearchParams({
      url: parsed.toString(),
    });

    if (filename) {
      searchParams.set('filename', filename);
    }

    return `/api/proxy-download?${searchParams.toString()}`;
  } catch {
    return url;
  }
}
