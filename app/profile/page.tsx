'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';

type PlayerRole = 'pending' | 'traitor' | 'faithful' | null;

const ProfilePage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [fullName, setFullName] = useState<string | null>(null);
    const [role, setRole] = useState<PlayerRole>(null);
    const [error, setError] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError) {
                    console.error(
                        'Error loading auth user for profile',
                        userError,
                    );
                }

                if (!user) {
                    router.replace('/login');
                    return;
                }

                const { data: player, error: playerError } = await supabase
                    .from('players')
                    .select('full_name, role')
                    .eq('id', user.id)
                    .maybeSingle();

                if (playerError) {
                    console.error(
                        'Error loading player for profile',
                        playerError,
                    );
                    if (isMounted) {
                        setError('There was a problem loading your profile.');
                    }
                    return;
                }

                if (!player) {
                    if (isMounted) {
                        setError('No profile found for your account.');
                    }
                    return;
                }

                if (isMounted) {
                    setFullName(player.full_name ?? null);
                    setRole((player.role as PlayerRole) ?? null);
                }
            } catch (err) {
                console.error('Unexpected error loading profile', err);
                if (isMounted) {
                    setError('Unexpected error loading your profile.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            isMounted = false;
        };
    }, [router, supabase]);

    if (loading) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='text-(--tg-text-muted)'>Loading profile...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    const normalizedRole = role?.toLowerCase() as PlayerRole;

    const roleLabel = (() => {
        switch (normalizedRole) {
            case 'traitor':
                return 'Traitor';
            case 'faithful':
                return 'Faithful';
            case 'pending':
            default:
                return 'Pending';
        }
    })();

    const roleAvailable =
        normalizedRole === 'traitor' || normalizedRole === 'faithful';

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-md'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-2 text-center text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <h2 className='mb-1 text-center text-2xl font-semibold text-(--tg-text)'>
                            Your profile
                        </h2>
                        <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                            This is where your secret role will appear once the
                            host reveals it.
                        </p>

                        {fullName ? (
                            <p className='mb-4 text-center text-sm text-(--tg-text)'>
                                Signed in as{' '}
                                <span className='font-semibold'>
                                    {fullName}
                                </span>
                            </p>
                        ) : null}

                        {roleAvailable ? (
                            <button
                                type='button'
                                onClick={() => setRevealed((value) => !value)}
                                className='relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-(--tg-gold)/60 bg-[radial-gradient(circle_at_10%_0%,#3b2412_0,#241414_45%,#140b0b_100%)] px-6 py-8 text-center shadow-[0_18px_35px_rgba(0,0,0,0.8)] transition hover:border-(--tg-gold) hover:shadow-[0_22px_40px_rgba(0,0,0,0.9)] active:translate-y-px active:scale-[0.99]'
                            >
                                <span className='mb-2 text-xs font-semibold tracking-[0.2em] text-(--tg-gold-soft) uppercase'>
                                    Tap to {revealed ? 'hide' : 'reveal'} your
                                    role
                                </span>

                                <span
                                    className={`mt-1 text-3xl font-black tracking-wide transition duration-300 ${
                                        revealed
                                            ? 'scale-100 text-(--tg-gold) opacity-100'
                                            : 'scale-95 text-(--tg-text-muted) opacity-60 blur-[2px]'
                                    }`}
                                >
                                    {revealed
                                        ? `YOU ARE ${roleLabel.toUpperCase()}`
                                        : 'HOLD TO REVEAL'}
                                </span>

                                {!revealed ? (
                                    <span className='mt-3 text-[11px] text-(--tg-text-muted)'>
                                        Only tap when you are ready. No one else
                                        should see your screen.
                                    </span>
                                ) : (
                                    <span className='mt-3 text-[11px] text-(--tg-text-muted)'>
                                        This is your secret role for the game.
                                    </span>
                                )}
                            </button>
                        ) : (
                            <div className='rounded-xl border border-(--tg-gold)/40 bg-(--tg-surface-muted) px-4 py-4 text-center text-sm text-(--tg-text-muted)'>
                                Your role is not available yet. The host will
                                assign roles when the game begins.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
