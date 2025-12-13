'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';
import { GameRound, Player, RoundStatus } from '@/utils/types';

type ActiveRound = Pick<GameRound, 'id' | 'round' | 'type' | 'status'>;

const VotingPage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [votedForName, setVotedForName] = useState<string | null>(null);

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
                        'Error fetching user for voting page',
                        userError,
                    );
                }

                if (!user) {
                    router.replace('/login');
                    return;
                }

                const { data: activeGame, error: activeGameError } =
                    await supabase
                        .from('games')
                        .select('id, status, roles_revealed')
                        .eq('status', RoundStatus.Active)
                        .maybeSingle();

                if (activeGameError) {
                    console.error('Error loading active game', activeGameError);
                }

                if (!activeGame) {
                    setActiveRound(null);
                    setPlayers([]);
                    setMessage(
                        'No active game is currently configured. Please wait for the host to start a game.',
                    );
                    return;
                }

                if (
                    (activeGame as { roles_revealed?: boolean }).roles_revealed
                ) {
                    router.replace('/profile');
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
                    setActiveRound(null);
                    setPlayers([]);
                    setMessage(
                        'You are not part of the active game. Please complete your player profile for the current game.',
                    );
                    return;
                }

                const { data: round, error: roundError } = await supabase
                    .from('game_rounds')
                    .select('id, round, type, status')
                    .eq('game_id', activeGame.id)
                    .eq('status', RoundStatus.Active)
                    .in('type', ['banishment_vote', 'killing_vote'])
                    .maybeSingle();

                if (roundError) {
                    console.error('Error loading current round', roundError);
                }

                if (!round) {
                    setActiveRound(null);
                    setPlayers([]);
                    return;
                }

                if (!isMounted) return;

                setActiveRound(round as ActiveRound);

                const { data: playersData, error: playersError } =
                    await supabase
                        .from('players')
                        .select('id, full_name, eliminated')
                        .eq('game_id', activeGame.id)
                        .eq('eliminated', false)
                        .neq('id', user.id)
                        .order('full_name', { ascending: true });

                if (playersError) {
                    console.error(
                        'Error loading players for voting',
                        playersError,
                    );
                    setPlayers([]);
                } else {
                    setPlayers(playersData ?? []);
                }
            } catch (error) {
                console.error('Unexpected error setting up voting page', error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void load();

        // Fetch updates every 10 seconds
        // TODO - change to real-time subscriptions
        const intervalId = setInterval(() => {
            void load();
        }, 10000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [router, supabase]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!activeRound) {
            return;
        }

        if (!selectedPlayerId) {
            alert('Please select a player before casting your vote.');
            return;
        }

        setSubmitting(true);
        setMessage(null);

        try {
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
                console.error(
                    'Error fetching user before casting vote',
                    userError,
                );
            }

            if (!user) {
                router.replace('/login');
                return;
            }

            if (selectedPlayerId === user.id) {
                alert('You cannot vote for yourself.');
                return;
            }

            // Check if this user has already submitted a response for this round.
            const { data: existingVote, error: existingVoteError } =
                await supabase
                    .from('votes')
                    .select('id')
                    .eq('voter_id', user.id)
                    .eq('round_id', activeRound.id)
                    .maybeSingle();

            if (existingVoteError) {
                console.error(
                    'Error checking for existing vote',
                    existingVoteError,
                );
            }

            if (existingVote) {
                setMessage(
                    'Your response for this round has already been recorded.',
                );
                return;
            }

            // Determine if this player is a traitor for kill rounds.
            // Assumes a `role` column on `players` with values like 'Traitor' | 'Faithful'.
            const { data: selfPlayer, error: selfError } = await supabase
                .from('players')
                .select('role, eliminated')
                .eq('id', user.id)
                .maybeSingle();

            if (selfError) {
                console.error(
                    'Error loading current player role for vote',
                    selfError,
                );
            }

            const isEliminated =
                (selfPlayer as { eliminated?: boolean } | null)?.eliminated ===
                true;

            if (isEliminated) {
                setMessage(
                    'You have been eliminated and cannot vote in this round.',
                );
                return;
            }

            const isTraitor =
                (
                    selfPlayer as { role?: string } | null
                )?.role?.toLowerCase() === 'traitor';
            const isKillRound = activeRound.type === 'killing_vote';

            const voteType = isKillRound && isTraitor ? 'kill' : 'standard';

            const { error: insertError } = await supabase.from('votes').insert({
                voter_id: user.id,
                target_id: selectedPlayerId,
                round_id: activeRound.id,
                type: voteType,
            });

            if (insertError) {
                console.error('Error casting vote', insertError);
                alert(
                    'There was a problem recording your response. Please try again.',
                );
                return;
            }
            // For banishment votes, switch to a simple confirmation screen
            // that only shows the name of the chosen player so the group
            // can discuss before the count is revealed.
            if (activeRound.type === 'banishment_vote') {
                const chosen = players.find(
                    (player) => player.id === selectedPlayerId,
                );
                setVotedForName(chosen?.full_name ?? 'Your chosen player');
                setMessage(null);
            } else {
                setMessage('Your response has been recorded.');
            }
        } catch (error) {
            console.error('Unexpected error casting vote', error);
            alert(
                'There was a problem recording your response. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='text-(--tg-text-muted)'>
                    Loading voting round…
                </div>
            </div>
        );
    }

    if (!activeRound) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        No voting round is currently active. Please wait for the
                        host to start the next round.
                    </div>
                </div>
            </div>
        );
    }

    if (activeRound.type === 'banishment_vote' && votedForName) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md'>
                    <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                        <div className='rounded-2xl bg-(--tg-surface) px-8 py-10 text-center shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                            <h1 className='mb-3 text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                                THE TRAITORS
                            </h1>
                            <p className='mb-2 text-xs tracking-[0.25em] text-(--tg-text-muted) uppercase'>
                                You voted for
                            </p>
                            <p className='mb-6 text-3xl font-extrabold wrap-break-word text-(--tg-gold) sm:text-4xl'>
                                {votedForName}
                            </p>
                            <p className='text-xs text-(--tg-text-muted)'>
                                Hold this screen up when it&apos;s your turn to
                                reveal and explain your choice.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-md'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-2 text-center text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <h2 className='mb-1 text-center text-2xl font-semibold text-(--tg-text)'>
                            Voting round
                        </h2>
                        <p className='mb-1 text-center text-xs text-(--tg-text-muted)'>
                            {`Round ${activeRound.round ?? '—'} · ${(() => {
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
                        <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                            Make your choice carefully. Your response will be
                            recorded for this round.
                        </p>

                        <form className='space-y-6' onSubmit={handleSubmit}>
                            <div>
                                <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                    Your selection
                                </label>
                                <select
                                    className='w-full rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                    value={selectedPlayerId}
                                    onChange={(event) =>
                                        setSelectedPlayerId(event.target.value)
                                    }
                                    required
                                >
                                    <option value='' disabled>
                                        Select a player
                                    </option>
                                    {players.map((player) => (
                                        <option
                                            key={player.id}
                                            value={player.id}
                                        >
                                            {player.full_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type='submit'
                                disabled={submitting}
                                className='inline-flex w-full items-center justify-center rounded-full bg-(--tg-gold) px-4 py-2 text-sm font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft) disabled:cursor-not-allowed disabled:opacity-60'
                            >
                                {submitting ? 'Submitting…' : 'Cast vote'}
                            </button>

                            {message ? (
                                <p className='text-center text-xs text-(--tg-text-muted)'>
                                    {message}
                                </p>
                            ) : null}
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VotingPage;
