import Link from 'next/link';
import { cookies } from 'next/headers';

import { createClient } from '@/utils/supabase/server';

/**
 * Home page of the Traitors Game application.
 * This page has the login and landing content.
 */
export default async function Home() {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const isLoggedIn = !!user;

    return (
        <main className='flex min-h-screen flex-col items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <h1 className='text-center text-4xl font-extrabold tracking-wide text-(--tg-gold)'>
                Welcome to our Traitors Game
            </h1>

            <video
                className='mt-8 w-full max-w-xl rounded-xl border border-(--tg-gold-soft) bg-(--tg-surface)/80 shadow-2xl'
                autoPlay
                disablePictureInPicture
                loop
                muted
                playsInline
                title='Traitors Game Fade In Logo'
            >
                <source src='/traitors.mp4' type='video/mp4' />
            </video>

            <p className='mt-6 max-w-xl text-center text-lg text-(--tg-text-muted)'>
                Enter the manor, watch your back, and uncover the Traitors.
            </p>

            <Link
                href={isLoggedIn ? '/profile' : '/login'}
                className='mt-8 inline-flex items-center rounded-full bg-(--tg-gold) px-6 py-2 text-base font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft)'
            >
                {isLoggedIn ? 'Am I a Traitor?' : 'Go to Login'}
            </Link>
        </main>
    );
}
