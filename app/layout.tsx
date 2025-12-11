import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import localFont from 'next/font/local';

export const traitorsFont = localFont({
    src: '../public/fonts/vladb-yarocut-black.otf',
});

export const metadata: Metadata = {
    title: 'Traitors Game',
    description: 'Welcome to Traitors!',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en'>
            <head>
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1'
                />
            </head>
            <body className={traitorsFont.className}>
                <header className='border-b border-(--tg-gold)/20 bg-(--tg-surface)/80 px-4 py-3 backdrop-blur-sm'>
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
                                {/* TODO - only show login if not logged in */}
                                <Link
                                    href='/login'
                                    className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                >
                                    Login
                                </Link>
                                <Link
                                    href='/player-wall'
                                    className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                >
                                    Player wall
                                </Link>
                                <Link
                                    href='/host/games'
                                    className='block px-4 py-2 transition hover:bg-(--tg-surface-muted) hover:text-(--tg-gold-soft) active:bg-(--tg-red-soft) active:text-(--tg-bg)'
                                >
                                    Host games
                                </Link>
                            </div>
                        </div>
                    </nav>
                </header>
                <main>{children}</main>
            </body>
        </html>
    );
}
