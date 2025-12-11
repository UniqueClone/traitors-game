'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';
import { GameRound, Player, RoundStatus } from '@/utils/types';

type WallPlayer = Player & { headshot_url: string };
type ActiveRound = Pick<GameRound, 'id' | 'round' | 'type' | 'status'>;

export default function PlayerWallPage() {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const [players, setPlayers] = useState<WallPlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [isHost, setIsHost] = useState(false);
    const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError) {
                    console.error('Error loading auth user', userError);
                }

                if (!user) {
                    router.replace('/login');
                    return;
                }

                const { data: activeGame, error: activeGameError } =
                    await supabase
                        .from('games')
                        .select('id, status, host, current_round_number')
                        .eq('status', 'active')
                        .maybeSingle();

                if (activeGameError) {
                    console.error('Error loading active game', activeGameError);
                }

                if (!activeGame) {
                    setMessage('No active game is currently configured.');
                    setPlayers([]);
                    setActiveRound(null);
                    setIsHost(false);
                    return;
                }

                const { data: membership, error: membershipError } =
                    await supabase
                        .from('players')
                        .select('id')
                        .eq('id', user.id)
                        .eq('game_id', activeGame.id)
                        .maybeSingle();

                if (membershipError) {
                    console.error(
                        'Error checking game membership',
                        membershipError,
                    );
                }

                if (!membership) {
                    setMessage(
                        'You are not part of the active game. Please complete your player profile for the current game.',
                    );
                    setPlayers([]);
                    setActiveRound(null);
                    setIsHost(false);
                    return;
                }

                if (!isMounted) return;

                setIsHost(activeGame.host === user.id);

                const { data, error: fetchError } = await supabase
                    .from('players')
                    .select('id, full_name, headshot_url, eliminated')
                    .eq('game_id', activeGame.id)
                    .order('full_name', { ascending: true });

                if (fetchError) {
                    console.error('Error loading players', fetchError);
                    return;
                }

                setPlayers((data ?? []) as WallPlayer[]);

                const { data: roundData, error: roundError } = await supabase
                    .from('game_rounds')
                    .select('id, game_id, round, type, status')
                    .eq('game_id', activeGame.id)
                    .eq('status', RoundStatus.Active)
                    .maybeSingle();

                if (roundError) {
                    console.error(
                        'Error loading active round for wall',
                        roundError,
                    );
                }

                setActiveRound((roundData ?? null) as ActiveRound | null);
            } catch (err) {
                console.error('Error loading players', err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void load();

        const intervalId = setInterval(() => {
            void load();
        }, 10000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [router, supabase]);

    /** TODO - elimination should not be toggleable by any player; should be done automatically during specific game phases */
    const toggleEliminated = async (id: string, current: boolean) => {
        if (!isHost) {
            return;
        }

        setPlayers((prev) =>
            prev.map((player) =>
                player.id === id
                    ? {
                          ...player,
                          eliminated: !current,
                      }
                    : player,
            ),
        );

        const { error: updateError } = await supabase
            .from('players')
            .update({ eliminated: !current })
            .eq('id', id);

        if (updateError) {
            // roll back optimistic update on error
            setPlayers((prev) =>
                prev.map((player) =>
                    player.id === id
                        ? {
                              ...player,
                              eliminated: current,
                          }
                        : player,
                ),
            );
            alert('Error updating player: ' + updateError.message);
        }
    };

    if (loading) {
        return (
            <main className='min-h-screen bg-(--tg-bg) px-4 py-8'>
                <div className='text-center text-(--tg-text-muted)'>
                    Loading players…
                </div>
            </main>
        );
    }

    if (message) {
        return (
            <main className='min-h-screen bg-(--tg-bg) px-4 py-8'>
                <div className='mx-auto w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        {message}
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className='min-h-screen bg-(--tg-bg) px-4 py-8'>
            <h1 className='mb-2 text-center text-3xl font-bold text-(--tg-gold)'>
                Player Wall
            </h1>

            {activeRound ? (
                <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                    {`Current phase: Round ${activeRound.round ?? '—'} · ${(() => {
                        switch (activeRound.type) {
                            case 'round_table':
                                return 'Round table';
                            case 'banishment_vote':
                                return 'Banishment vote';
                            case 'banishment_result':
                                return 'Banishment result';
                            case 'killing_vote':
                                return 'Killing vote';
                            case 'breakfast':
                                return 'Breakfast';
                            case 'minigame':
                                return 'Minigame';
                            default:
                                return activeRound.type ?? 'Unknown';
                        }
                    })()}`}
                </p>
            ) : (
                <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                    Waiting for the host to start the next phase.
                </p>
            )}

            <div className='mx-auto grid max-w-5xl grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4'>
                {players.map((player) => (
                    <button
                        key={player.id}
                        type='button'
                        disabled={!isHost}
                        onClick={() =>
                            toggleEliminated(player.id, player.eliminated)
                        }
                        className={`group relative flex aspect-3/4 flex-col items-stretch rounded-xl border-4 border-(--tg-gold) bg-(--tg-surface) p-1 shadow-lg transition ${
                            isHost
                                ? 'hover:-translate-y-1 hover:shadow-xl'
                                : 'opacity-90'
                        }`}
                    >
                        <div
                            className={`relative h-full w-full overflow-hidden rounded-lg bg-black/40 transition duration-300 ${player.eliminated ? 'opacity-80 contrast-75 grayscale' : 'opacity-100 grayscale-0'}`}
                        >
                            {player.headshot_url &&
                            player.headshot_url.trim() !== '' ? (
                                <Image
                                    src={player.headshot_url}
                                    alt={player.full_name}
                                    fill
                                    className='object-cover'
                                    sizes='(min-width: 768px) 200px, 33vw'
                                />
                            ) : (
                                <div className='flex h-full w-full items-center justify-center bg-(--tg-surface-muted) text-(--tg-text-muted)'>
                                    No image
                                </div>
                            )}

                            <div
                                className={`pointer-events-none absolute inset-0 flex items-center justify-center transition duration-300 ${player.eliminated ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
                            >
                                {/* Two red marks for the x */}
                                <div className='absolute h-[30px] w-[150%] rotate-45 bg-(--tg-red-soft) shadow-[0_0_10px_rgba(0,0,0,0.6)]' />
                                <div className='absolute h-[30px] w-[150%] -rotate-45 bg-(--tg-red-soft) shadow-[0_0_10px_rgba(0,0,0,0.6)]' />
                            </div>
                            <div className='pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent' />
                        </div>

                        <span className='pointer-events-none mt-2 block text-center text-sm font-semibold text-(--tg-text)'>
                            {player.full_name}
                        </span>
                    </button>
                ))}
            </div>
        </main>
    );
}
