import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/proxy-download
 *
 * 외부 URL을 프록시하여 다운로드
 * - url: 다운로드할 파일 URL
 * - filename: 저장할 파일명 (optional)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    const filename = searchParams.get('filename') || 'download';

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // URL 유효성 검사
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL' },
        { status: 400 }
      );
    }

    // 보안: 허용된 도메인만 프록시 (R2 public URL 등)
    const allowedHosts = [
      process.env.R2_PUBLIC_URL ? new URL(process.env.R2_PUBLIC_URL).host : null,
      'pub-', // Cloudflare R2 public bucket prefix
    ].filter(Boolean);

    const isAllowed = allowedHosts.some(host =>
      host && parsedUrl.host.includes(host as string)
    );

    if (!isAllowed && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: 'Domain not allowed' },
        { status: 403 }
      );
    }

    console.log('[Proxy Download] Fetching:', url);

    // 외부 URL에서 파일 fetch
    const response = await fetch(url);

    if (!response.ok) {
      console.error('[Proxy Download] Fetch failed:', response.status);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch file' },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    console.log('[Proxy Download] Success, size:', buffer.byteLength);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[Proxy Download] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
