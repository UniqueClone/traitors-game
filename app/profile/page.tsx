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
    const [hasShield, setHasShield] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [traitorAllies, setTraitorAllies] = useState<
        { id: string; full_name: string }[] | null
    >(null);

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
                    .select('full_name, role, has_shield, game_id')
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
                    setHasShield(
                        (player.has_shield as boolean | null) === true,
                    );

                    // If this player is a Traitor in a game where roles
                    // have been revealed, load the other traitors so they
                    // can see their allies while viewing their profile.
                    const normalized = (player.role ?? '')
                        .toString()
                        .toLowerCase();
                    const isTraitor = normalized === 'traitor';
                    const gameId = (player as { game_id?: string | null })
                        .game_id;

                    if (isTraitor && gameId) {
                        try {
                            const { data: game, error: gameError } =
                                await supabase
                                    .from('games')
                                    .select('roles_revealed')
                                    .eq('id', gameId)
                                    .maybeSingle();

                            if (gameError) {
                                console.error(
                                    'Error loading game for traitor allies',
                                    gameError,
                                );
                            }

                            const rolesRevealed = Boolean(
                                (game as { roles_revealed?: boolean | null })
                                    ?.roles_revealed,
                            );

                            if (rolesRevealed) {
                                const { data: allies, error: alliesError } =
                                    await supabase
                                        .from('players')
                                        .select('id, full_name')
                                        .eq('game_id', gameId)
                                        .eq('role', 'traitor')
                                        .neq('id', user.id)
                                        .order('full_name', {
                                            ascending: true,
                                        });

                                if (alliesError) {
                                    console.error(
                                        'Error loading fellow traitors',
                                        alliesError,
                                    );
                                } else {
                                    setTraitorAllies(
                                        (allies ?? []) as {
                                            id: string;
                                            full_name: string;
                                        }[],
                                    );
                                }
                            } else {
                                setTraitorAllies(null);
                            }
                        } catch (allyError) {
                            console.error(
                                'Unexpected error loading traitor allies',
                                allyError,
                            );
                            setTraitorAllies(null);
                        }
                    } else {
                        setTraitorAllies(null);
                    }
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
    const isTraitor = normalizedRole === 'traitor';
    const isFaithful = normalizedRole === 'faithful';

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

    const roleAvailable = isTraitor || isFaithful;

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
                            <p className='mb-2 text-center text-sm text-(--tg-text)'>
                                Signed in as{' '}
                                <span className='font-semibold'>
                                    {fullName}
                                </span>
                            </p>
                        ) : null}

                        {hasShield && (
                            <p className='mb-4 text-center text-xs text-(--tg-text-muted)'>
                                <span className='inline-flex items-center justify-center gap-2 font-semibold text-(--tg-gold-soft)'>
                                    <span className='relative inline-flex h-6 w-6 items-center justify-center'>
                                        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-(--tg-gold-soft) opacity-60' />
                                        <span className='relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_0%,#ffffff_0,#f3e19c_30%,#d4af37_70%,#8a6b1f_100%)] shadow-[0_0_18px_rgba(212,175,55,0.9)]' />
                                    </span>
                                    <span>
                                        You currently have a shield against the
                                        next Traitor kill round.
                                    </span>
                                </span>
                            </p>
                        )}

                        {roleAvailable ? (
                            <button
                                type='button'
                                onClick={() => setRevealed((value) => !value)}
                                className='relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-(--tg-gold)/60 bg-[radial-gradient(circle_at_10%_0%,#3b2412_0,#241414_45%,#140b0b_100%)] px-6 py-8 text-center shadow-[0_18px_35px_rgba(0,0,0,0.8)] transition hover:border-(--tg-gold) hover:shadow-[0_22px_40px_rgba(0,0,0,0.9)] active:translate-y-px active:scale-[0.99]'
                            >
                                {revealed && (
                                    <span
                                        aria-hidden='true'
                                        className={`pointer-events-none absolute inset-0 opacity-60 mix-blend-screen transition-opacity duration-1000 ${
                                            isTraitor
                                                ? 'bg-[radial-gradient(circle_at_50%_0%,rgba(208,63,63,0.7),transparent_60%)]'
                                                : 'bg-[radial-gradient(circle_at_50%_0%,rgba(201,176,95,0.7),transparent_60%)]'
                                        }`}
                                    />
                                )}
                                <span className='mb-2 text-xs font-semibold tracking-[0.2em] text-(--tg-gold-soft) uppercase'>
                                    Tap to {revealed ? 'hide' : 'reveal'} your
                                    role
                                </span>

                                <span
                                    className={`mt-1 text-3xl font-black tracking-[0.35em] transition-all duration-1000 ease-out ${
                                        revealed
                                            ? `blur-0 scale-110 opacity-100 ${
                                                  isTraitor
                                                      ? 'text-(--tg-red-soft) drop-shadow-[0_0_25px_rgba(208,63,63,0.9)]'
                                                      : 'text-(--tg-gold) drop-shadow-[0_0_22px_rgba(201,176,95,0.85)]'
                                              }`
                                            : 'scale-90 text-(--tg-text-muted) opacity-30 blur-xs'
                                    }`}
                                >
                                    {revealed
                                        ? `YOU ARE ${roleLabel.toUpperCase()}`
                                        : 'ROLE HIDDEN'}
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

                        {isTraitor &&
                        revealed &&
                        traitorAllies &&
                        traitorAllies.length > 0 ? (
                            <div className='mt-4 rounded-xl border border-(--tg-gold)/40 bg-(--tg-surface-muted) px-4 py-4 text-sm text-(--tg-text)'>
                                <p className='mb-2 text-[11px] font-semibold tracking-[0.18em] text-(--tg-gold-soft) uppercase'>
                                    Other traitors
                                </p>
                                <ul className='space-y-1 text-sm'>
                                    {traitorAllies.map((ally) => (
                                        <li
                                            key={ally.id}
                                            className='flex items-center justify-between rounded-md bg-[rgba(0,0,0,0.35)] px-3 py-1.5'
                                        >
                                            <span className='font-medium'>
                                                {ally.full_name}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
