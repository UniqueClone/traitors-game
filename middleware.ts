import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
    const { supabase, response } = createClient(request);

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    const isProtectedRoute =
        pathname.startsWith('/login/new-player') ||
        pathname.startsWith('/voting') ||
        pathname.startsWith('/host') ||
        pathname.startsWith('/profile');

    if (!user && isProtectedRoute) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/login';
        return NextResponse.redirect(redirectUrl);
    }

    // If already logged in, sending them back to login is not useful
    if (user && pathname === '/login') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/profile';
        return NextResponse.redirect(redirectUrl);
    }

    return response;
}

export const config = {
    matcher: [
        '/login/:path*',
        '/voting/:path*',
        '/host/:path*',
        '/profile/:path*',
    ],
};
