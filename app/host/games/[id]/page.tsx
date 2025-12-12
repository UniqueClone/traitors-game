'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import BackArrowIcon from '@/app/components/BackArrowIcon';
import { createClient } from '@/utils/supabase/client';
import { Game, GameRound, RoundStatus, RoundType } from '@/utils/types';

const GameManagePage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const gameId = params.id;

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [game, setGame] = useState<Game | null>(null);
    const [rounds, setRounds] = useState<GameRound[]>([]);

    type RoundResultEntry = {
        playerId: string;
        fullName: string;
        voteCount: number;
        eliminated: boolean;
    };

    const [resultsRoundId, setResultsRoundId] = useState<string | null>(null);
    const [roundResults, setRoundResults] = useState<RoundResultEntry[] | null>(
        null,
    );
    const [resultsLoading, setResultsLoading] = useState(false);
    const [resultsError, setResultsError] = useState<string | null>(null);

    const [newRoundType, setNewRoundType] = useState<RoundType>('round_table');

    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [notHostMessage, setNotHostMessage] = useState<string | null>(null);

    const nextRoundNumber = useMemo(() => {
        if (!rounds.length) return 1;
        const numericRounds = rounds
            .map((round) => round.round ?? 0)
            .filter((value) => Number.isFinite(value));
        if (!numericRounds.length) return 1;
        return Math.max(...numericRounds) + 1;
    }, [rounds]);

    useEffect(() => {
        void (async () => {
            try {
                const {
                    data: { user },
                    error: userError,
                } = await supabase.auth.getUser();

                if (userError) {
                    console.error(
                        'Error loading auth user for game manage',
                        userError,
                    );
                }

                if (!user) {
                    router.replace('/login');
                    return;
                }

                setCurrentUserId(user.id);

                if (!gameId) {
                    setErrorMessage('No game id provided in route.');
                    return;
                }

                const { data: gameData, error: gameError } = await supabase
                    .from('games')
                    .select(
                        'id, name, status, current_round_number, created_at, host',
                    )
                    .eq('id', gameId)
                    .maybeSingle();

                if (gameError) {
                    console.error(
                        'Error loading game for management',
                        gameError,
                    );
                    setErrorMessage('Error loading game from Supabase.');
                    return;
                }

                if (!gameData) {
                    setErrorMessage('Game not found.');
                    return;
                }

                if (gameData.host && gameData.host !== user.id) {
                    setNotHostMessage(
                        'You are not the host for this game. Only the host can manage rounds.',
                    );
                }

                setGame(gameData as Game);

                const { data: roundsData, error: roundsError } = await supabase
                    .from('game_rounds')
                    .select('id, game_id, round, type, status')
                    .eq('game_id', gameId)
                    .order('round', { ascending: true });

                if (roundsError) {
                    console.error('Error loading rounds for game', roundsError);
                    setErrorMessage('Error loading rounds for this game.');
                    return;
                }

                setRounds((roundsData ?? []) as GameRound[]);
            } catch (error) {
                console.error(
                    'Unexpected error loading game manage page',
                    error,
                );
                setErrorMessage('Unexpected error loading game management.');
            } finally {
                setLoading(false);
            }
        })();
    }, [gameId, router, supabase]);

    const refreshRounds = async () => {
        if (!gameId) {
            return;
        }

        const { data, error } = await supabase
            .from('game_rounds')
            .select('id, game_id, round, type, status')
            .eq('game_id', gameId)
            .order('round', { ascending: true });

        if (error) {
            console.error('Error reloading rounds', error);
            setErrorMessage('Error reloading rounds from Supabase.');
            return;
        }

        setRounds((data ?? []) as GameRound[]);
    };

    const handleCreateRound = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { error } = await supabase.from('game_rounds').insert({
                game_id: game.id,
                round: nextRoundNumber,
                type: newRoundType,
                status: 'pending',
            });

            if (error) {
                console.error('Error creating round', error);
                setErrorMessage('Error creating new round.');
                return;
            }

            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error creating round', error);
            setErrorMessage('Unexpected error creating new round.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSetRoundActive = async (round: GameRound) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            // Close any currently active rounds for this game
            const { error: closeError } = await supabase
                .from('game_rounds')
                .update({ status: RoundStatus.Ended })
                .eq('game_id', game.id)
                .eq('status', RoundStatus.Active)
                .neq('id', round.id);

            if (closeError) {
                console.error(
                    'Error closing existing active rounds',
                    closeError,
                );
                setErrorMessage('Error closing other active rounds.');
                return;
            }

            // Set this round as active
            const { error: activateError } = await supabase
                .from('game_rounds')
                .update({ status: RoundStatus.Active })
                .eq('id', round.id);

            if (activateError) {
                console.error('Error setting round active', activateError);
                setErrorMessage('Error setting round active.');
                return;
            }

            // Optionally update current_round_number on the game
            const { error: gameUpdateError } = await supabase
                .from('games')
                .update({ current_round_number: round.round ?? null })
                .eq('id', game.id);

            if (gameUpdateError) {
                console.error(
                    'Error updating game current_round_number',
                    gameUpdateError,
                );
                // Non-fatal; keep going
            }

            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error setting round active', error);
            setErrorMessage('Unexpected error setting round active.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseRound = async (roundId: string) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { error } = await supabase
                .from('game_rounds')
                .update({ status: RoundStatus.Ended })
                .eq('id', roundId);

            if (error) {
                console.error('Error closing round', error);
                setErrorMessage('Error closing round.');
                return;
            }

            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error closing round', error);
            setErrorMessage('Unexpected error closing round.');
        } finally {
            setSubmitting(false);
        }
    };

    const loadRoundResults = async (round: GameRound) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setResultsRoundId(round.id);
        setRoundResults(null);
        setResultsError(null);
        setResultsLoading(true);

        try {
            const { data: votesData, error: votesError } = await supabase
                .from('votes')
                .select('target_id')
                .eq('round_id', round.id);

            if (votesError) {
                console.error('Error loading votes for round', votesError);
                setResultsError('Error loading votes for this round.');
                return;
            }

            const votes = (votesData ?? []) as { target_id: string }[];

            if (!votes.length) {
                setRoundResults([]);
                return;
            }

            const counts = new Map<string, number>();
            for (const vote of votes) {
                counts.set(
                    vote.target_id,
                    (counts.get(vote.target_id) ?? 0) + 1,
                );
            }

            const targetIds = Array.from(counts.keys());

            const { data: playersData, error: playersError } = await supabase
                .from('players')
                .select('id, full_name, eliminated')
                .in('id', targetIds);

            if (playersError) {
                console.error(
                    'Error loading players for round results',
                    playersError,
                );
                setResultsError('Error loading players for round results.');
                return;
            }

            const tallies: RoundResultEntry[] = (playersData ?? []).map(
                (player: {
                    id: string;
                    full_name: string;
                    eliminated: boolean;
                }) => ({
                    playerId: player.id,
                    fullName: player.full_name,
                    eliminated: player.eliminated,
                    voteCount: counts.get(player.id) ?? 0,
                }),
            );

            tallies.sort((a, b) => b.voteCount - a.voteCount);

            setRoundResults(tallies);
        } catch (error) {
            console.error('Unexpected error loading round results', error);
            setResultsError('Unexpected error loading round results.');
        } finally {
            setResultsLoading(false);
        }
    };

    const handleEliminateFromResults = async (playerId: string) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setResultsError(null);

        try {
            const { error } = await supabase
                .from('players')
                .update({ eliminated: true })
                .eq('id', playerId);

            if (error) {
                console.error('Error eliminating player from results', error);
                setResultsError('Error eliminating player.');
                return;
            }

            setRoundResults((prev) =>
                (prev ?? []).map((entry) =>
                    entry.playerId === playerId
                        ? { ...entry, eliminated: true }
                        : entry,
                ),
            );
        } catch (error) {
            console.error('Unexpected error eliminating player', error);
            setResultsError('Unexpected error eliminating player.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='text-(--tg-text-muted)'>Loading game…</div>
            </div>
        );
    }

    if (errorMessage && !game) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        {errorMessage}
                    </div>
                </div>
            </div>
        );
    }

    if (!game) {
        return null;
    }

    if (notHostMessage) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        {notHostMessage}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <main className='min-h-screen bg-(--tg-bg) px-4 py-8'>
            <div className='mx-auto w-full max-w-2xl'>
                <div className='mb-4'>
                    <button
                        type='button'
                        onClick={() => router.push('/host/games')}
                        className='text-xs font-medium text-(--tg-text-muted) hover:text-(--tg-gold-soft)'
                    >
                        <span className='inline-flex items-center gap-1'>
                            <BackArrowIcon />
                            Back to games
                        </span>
                    </button>
                </div>

                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-2 text-center text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <h2 className='mb-1 text-center text-2xl font-semibold text-(--tg-text)'>
                            Manage game
                        </h2>
                        <p className='mb-4 text-center text-sm text-(--tg-text-muted)'>
                            {game.name} · Status: {game.status}
                            {typeof game.current_round_number === 'number'
                                ? ` · Current round: ${game.current_round_number}`
                                : ''}
                        </p>

                        {errorMessage ? (
                            <p className='mb-4 text-sm text-(--tg-red-soft)'>
                                {errorMessage}
                            </p>
                        ) : null}

                        <section className='mb-2 sm:mb-4'>
                            <h3 className='mb-3 text-sm font-semibold text-(--tg-gold-soft)'>
                                Rounds
                            </h3>
                            <form
                                className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-center'
                                onSubmit={handleCreateRound}
                            >
                                <div className='flex-1'>
                                    <label className='mb-1 block text-xs font-medium text-(--tg-text-muted)'>
                                        New round type
                                    </label>

                                    <div className='flex flex-col flex-wrap items-start gap-3'>
                                        <span className='rounded-full bg-(--tg-surface-muted) px-3 py-1 text-xs text-(--tg-text-muted)'>
                                            {`Round ${nextRoundNumber} – ${newRoundType.replace(/_/g, ' ')}`}
                                        </span>

                                        <select
                                            className='flex-1 rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-1.5 text-xs text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                            value={newRoundType}
                                            onChange={(event) =>
                                                setNewRoundType(
                                                    event.target
                                                        .value as RoundType,
                                                )
                                            }
                                        >
                                            <option value='round_table'>
                                                Round table
                                            </option>
                                            <option value='banishment_vote'>
                                                Banishment vote
                                            </option>
                                            <option value='banishment_result'>
                                                Banishment result
                                            </option>
                                            <option value='killing_vote'>
                                                Killing vote
                                            </option>
                                            <option value='breakfast'>
                                                Breakfast
                                            </option>
                                            <option value='minigame'>
                                                Minigame
                                            </option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    type='submit'
                                    disabled={submitting}
                                    className='inline-flex items-center justify-center rounded-full bg-(--tg-gold) px-4 py-2 text-xs font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft) disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Add round
                                </button>
                            </form>

                            <span className='mb-2 block text-xs font-medium text-(--tg-text-muted)'>
                                Manage rounds for this game:
                            </span>

                            <div className='max-h-[50vh] space-y-2 overflow-y-auto pr-1'>
                                {rounds.length === 0 ? (
                                    <p className='text-xs text-(--tg-text-muted)'>
                                        No rounds created yet for this game.
                                    </p>
                                ) : (
                                    rounds.map((round) => (
                                        <div
                                            key={round.id}
                                            className='flex flex-col gap-2 rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-4 py-3 text-xs text-(--tg-text) sm:flex-row sm:items-center sm:justify-between'
                                        >
                                            <div>
                                                <div className='font-semibold'>
                                                    Round {round.round ?? '—'} ·{' '}
                                                    {(() => {
                                                        switch (round.type) {
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
                                                                return (
                                                                    round.type ??
                                                                    'Unknown'
                                                                );
                                                        }
                                                    })()}
                                                </div>
                                                <div className='text-[11px] text-(--tg-text-muted)'>
                                                    Status:{' '}
                                                    {round.status ??
                                                        RoundStatus.Pending}
                                                </div>
                                            </div>
                                            <div className='flex flex-wrap gap-2 pt-1 sm:pt-0'>
                                                <button
                                                    type='button'
                                                    disabled={
                                                        submitting ||
                                                        round.status ===
                                                            RoundStatus.Active
                                                    }
                                                    onClick={() =>
                                                        void handleSetRoundActive(
                                                            round,
                                                        )
                                                    }
                                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold) px-3 py-1 text-[11px] font-semibold text-(--tg-gold-soft) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                >
                                                    Set active
                                                </button>
                                                <button
                                                    type='button'
                                                    disabled={
                                                        submitting ||
                                                        round.status ===
                                                            RoundStatus.Ended
                                                    }
                                                    onClick={() =>
                                                        void handleCloseRound(
                                                            round.id,
                                                        )
                                                    }
                                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-red-soft) px-3 py-1 text-[11px] font-semibold text-(--tg-red-soft) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                >
                                                    Close
                                                </button>
                                                {(round.type ===
                                                    'banishment_vote' ||
                                                    round.type ===
                                                        'killing_vote') && (
                                                    <button
                                                        type='button'
                                                        disabled={submitting}
                                                        onClick={() =>
                                                            void loadRoundResults(
                                                                round,
                                                            )
                                                        }
                                                        className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-3 py-1 text-[11px] font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                    >
                                                        View results
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            {resultsRoundId ? (
                                <div className='mt-4 rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-4 py-3 text-xs text-(--tg-text)'>
                                    <div className='mb-2 flex items-center justify-between'>
                                        <span className='font-semibold text-(--tg-gold-soft)'>
                                            Round results
                                        </span>
                                        <button
                                            type='button'
                                            className='text-[11px] text-(--tg-text-muted) hover:text-(--tg-gold-soft)'
                                            onClick={() => {
                                                setResultsRoundId(null);
                                                setRoundResults(null);
                                                setResultsError(null);
                                            }}
                                        >
                                            Close
                                        </button>
                                    </div>
                                    {resultsLoading ? (
                                        <p className='text-(--tg-text-muted)'>
                                            Loading results…
                                        </p>
                                    ) : resultsError ? (
                                        <p className='text-(--tg-red-soft)'>
                                            {resultsError}
                                        </p>
                                    ) : !roundResults ||
                                      roundResults.length === 0 ? (
                                        <p className='text-(--tg-text-muted)'>
                                            No votes have been recorded for this
                                            round yet.
                                        </p>
                                    ) : (
                                        <div className='space-y-1'>
                                            {roundResults.map((entry) => (
                                                <div
                                                    key={entry.playerId}
                                                    className='flex items-center justify-between gap-2'
                                                >
                                                    <div>
                                                        <div className='font-semibold'>
                                                            {entry.fullName}
                                                        </div>
                                                        <div className='text-[11px] text-(--tg-text-muted)'>
                                                            {entry.voteCount}{' '}
                                                            vote
                                                            {entry.voteCount ===
                                                            1
                                                                ? ''
                                                                : 's'}
                                                            {entry.eliminated
                                                                ? ' · Eliminated'
                                                                : ''}
                                                        </div>
                                                    </div>
                                                    {!entry.eliminated && (
                                                        <button
                                                            type='button'
                                                            disabled={
                                                                submitting
                                                            }
                                                            onClick={() =>
                                                                void handleEliminateFromResults(
                                                                    entry.playerId,
                                                                )
                                                            }
                                                            className='inline-flex items-center justify-center rounded-full border border-(--tg-red-soft) px-3 py-1 text-[11px] font-semibold text-(--tg-red-soft) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                        >
                                                            Eliminate
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default GameManagePage;
