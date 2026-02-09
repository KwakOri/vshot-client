import { NextRequest, NextResponse } from 'next/server';
import { decodeJwt } from 'jose';

const PROTECTED_PATHS = ['/host', '/festa-host'];
const ADMIN_PATHS = ['/admin'];
const TOKEN_COOKIE = 'vshot_token';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if path needs protection
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
  const isAdmin = ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (!isProtected && !isAdmin) {
    return NextResponse.next();
  }

  const token = request.cookies.get(TOKEN_COOKIE)?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const payload = decodeJwt(token);

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return redirectToLogin(request);
    }

    // Admin pages require admin role
    if (isAdmin && payload.role !== 'admin') {
      return redirectToLogin(request);
    }

    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/host/:path*', '/festa-host/:path*', '/admin/:path*'],
};
