import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import localFont from 'next/font/local';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';
import PhaseWatcher from '@/app/components/PhaseWatcher';

export const traitorsFont = localFont({
    src: '../public/fonts/vladb-yarocut-black.otf',
});

export const metadata: Metadata = {
    title: 'Traitors Game',
    description: 'Welcome to Traitors!',
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const isLoggedIn = !!user;

    let isHost = false;

    if (user) {
        const { data: hostGame, error: hostError } = await supabase
            .from('games')
            .select('id')
            .eq('host', user.id)
            .limit(1)
            .maybeSingle();

        if (hostError) {
            // Non-fatal; nav will simply omit the host link.
            console.error('Error checking host games for nav', hostError);
        }

        if (hostGame) {
            isHost = true;
        }
    }

    return (
        <html lang='en'>
            <head>
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1'
                />
            </head>
            <body className={traitorsFont.className}>
                <PhaseWatcher />
                <header className='sticky top-0 z-50 border-b border-(--tg-gold)/20 bg-(--tg-surface)/80 px-4 py-3 backdrop-blur-sm'>
                    <nav className='mx-auto flex max-w-5xl items-center justify-between gap-4'>
                        <Link
                            href='/'
                            className='text-sm font-semibold tracking-[0.3em] text-(--tg-gold-soft)'
                        >
                            THE TRAITORS
                        </Link>

                        <div className='relative'>
                            <input
                                id='main-nav-toggle'
                                type='checkbox'
                                className='peer hidden'
                            />

                            <label
                                htmlFor='main-nav-toggle'
                                className='flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-(--tg-gold)/40 bg-(--tg-surface-muted) shadow-sm transition hover:border-(--tg-gold) hover:bg-(--tg-surface)'
                                aria-label='Toggle navigation menu'
                            >
                                <span className='relative flex h-3 w-4 flex-col justify-between'>
                                    <span className='h-0.5 w-full rounded-full bg-(--tg-gold-soft) transition peer-checked:translate-y-[5px] peer-checked:rotate-45' />
                                    <span className='h-0.5 w-full rounded-full bg-(--tg-gold-soft) transition peer-checked:opacity-0' />
                                    <span className='h-0.5 w-full rounded-full bg-(--tg-gold-soft) transition peer-checked:-translate-y-[5px] peer-checked:-rotate-45' />
                                </span>
                            </label>

                            <div className='pointer-events-none absolute top-full right-0 z-50 mt-2 w-40 rounded-lg border border-(--tg-gold)/30 bg-(--tg-surface) py-2 text-sm font-medium text-(--tg-text-muted) opacity-0 shadow-xl transition duration-200 peer-checked:pointer-events-auto peer-checked:translate-y-0 peer-checked:opacity-100'>
                                <Link
                                    href='/'
                                    className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                >
                                    Home
                                </Link>

                                {!isLoggedIn ? (
                                    <Link
                                        href='/login'
                                        className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                    >
                                        Login
                                    </Link>
                                ) : (
                                    <>
                                        <Link
                                            href='/voting'
                                            className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                        >
                                            Voting
                                        </Link>

                                        {/* <Link
                                            href='/logout'
                                            className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                        >
                                            Logout
                                        </Link> */}

                                        <Link
                                            href='/profile'
                                            className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                        >
                                            Am I a Traitor?
                                        </Link>
                                        {isHost ? (
                                            <Link
                                                href='/host/games'
                                                className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                            >
                                                Manage Game
                                            </Link>
                                        ) : null}
                                    </>
                                )}
                            </div>
                        </div>
                    </nav>
                </header>
                <main>{children}</main>
            </body>
        </html>
    );
}
