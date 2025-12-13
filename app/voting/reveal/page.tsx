'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';
import { GameRound } from '@/utils/types';

type RevealRound = Pick<GameRound, 'id' | 'round' | 'type' | 'status'>;

type RoundResultEntry = {
    playerId: string;
    fullName: string;
    voteCount: number;
};

const VotingRevealPage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [round, setRound] = useState<RevealRound | null>(null);
    const [roundQuestion, setRoundQuestion] = useState<string | null>(null);
    const [results, setResults] = useState<RoundResultEntry[] | null>(null);
    const [traitorResults, setTraitorResults] = useState<
        RoundResultEntry[] | null
    >(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
                        'Error fetching user for voting reveal page',
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
                        .select('id, status, last_revealed_round')
                        .eq('status', 'active')
                        .maybeSingle();

                if (activeGameError) {
                    console.error(
                        'Error loading active game for reveal',
                        activeGameError,
                    );
                    setErrorMessage('Error loading active game.');
                    return;
                }

                if (!activeGame) {
                    setErrorMessage(
                        'No active game is currently configured. Please wait for the host to start a game.',
                    );
                    return;
                }

                const lastRevealedRoundNumber =
                    (activeGame as { last_revealed_round?: number | null })
                        .last_revealed_round ?? null;

                if (lastRevealedRoundNumber === null) {
                    setErrorMessage(
                        'No completed voting round has been revealed yet.',
                    );
                    return;
                }

                const { data: roundData, error: roundError } = await supabase
                    .from('game_rounds')
                    .select('id, game_id, round, type, status')
                    .eq('game_id', activeGame.id)
                    .eq('round', lastRevealedRoundNumber)
                    .in('type', ['banishment_vote', 'killing_vote'])
                    .maybeSingle();

                if (roundError) {
                    console.error('Error loading revealed round', roundError);
                    setErrorMessage('Error loading revealed round.');
                    return;
                }

                if (!roundData) {
                    setErrorMessage(
                        'The revealed round could not be found. Please ask the host to try again.',
                    );
                    return;
                }

                if (!isMounted) return;

                setRound(roundData as RevealRound);

                // For killing rounds, try to load the question that was shown
                // on the voting screen for this round (if available).
                if (roundData.type === 'killing_vote') {
                    try {
                        const storageKey = `tg:killingQuestion:${roundData.id}`;
                        const existing =
                            typeof window !== 'undefined'
                                ? window.localStorage.getItem(storageKey)
                                : null;
                        setRoundQuestion(existing || null);
                    } catch (error) {
                        console.error(
                            'Error loading killing round question for reveal',
                            error,
                        );
                        setRoundQuestion(null);
                    }
                } else {
                    setRoundQuestion(null);
                }

                const { data: votesData, error: votesError } = await supabase
                    .from('votes')
                    .select('target_id, type')
                    .eq('round_id', roundData.id);

                if (votesError) {
                    console.error('Error loading votes for reveal', votesError);
                    setErrorMessage('Error loading votes for this round.');
                    return;
                }

                const votes = (votesData ?? []) as {
                    target_id: string;
                    type: string;
                }[];

                if (!votes.length) {
                    setResults([]);
                    setTraitorResults(null);
                    return;
                }

                if (roundData.type === 'killing_vote') {
                    const faithfulCounts = new Map<string, number>();
                    const traitorCounts = new Map<string, number>();

                    for (const vote of votes) {
                        if (vote.type === 'kill') {
                            traitorCounts.set(
                                vote.target_id,
                                (traitorCounts.get(vote.target_id) ?? 0) + 1,
                            );
                        } else {
                            faithfulCounts.set(
                                vote.target_id,
                                (faithfulCounts.get(vote.target_id) ?? 0) + 1,
                            );
                        }
                    }

                    const targetIds = Array.from(
                        new Set([
                            ...faithfulCounts.keys(),
                            ...traitorCounts.keys(),
                        ]),
                    );

                    const { data: playersData, error: playersError } =
                        await supabase
                            .from('players')
                            .select('id, full_name')
                            .in('id', targetIds);

                    if (playersError) {
                        console.error(
                            'Error loading players for reveal results',
                            playersError,
                        );
                        setErrorMessage(
                            'Error loading players for reveal results.',
                        );
                        return;
                    }

                    const playersById = new Map(
                        (playersData ?? []).map(
                            (player: { id: string; full_name: string }) => [
                                player.id,
                                player.full_name,
                            ],
                        ),
                    );

                    const faithfulTallies: RoundResultEntry[] = Array.from(
                        faithfulCounts.entries(),
                    )
                        .map(([playerId, count]) => ({
                            playerId,
                            fullName:
                                (playersById.get(playerId) as string) ??
                                'Unknown player',
                            voteCount: count,
                        }))
                        .sort((a, b) => b.voteCount - a.voteCount);

                    const traitorTallies: RoundResultEntry[] = Array.from(
                        traitorCounts.entries(),
                    )
                        .map(([playerId, count]) => ({
                            playerId,
                            fullName:
                                (playersById.get(playerId) as string) ??
                                'Unknown player',
                            voteCount: count,
                        }))
                        .sort((a, b) => b.voteCount - a.voteCount);

                    setResults(faithfulTallies);
                    setTraitorResults(traitorTallies);
                } else {
                    const counts = new Map<string, number>();
                    for (const vote of votes) {
                        // For banishment rounds we only care about standard votes.
                        if (vote.type !== 'standard') continue;
                        counts.set(
                            vote.target_id,
                            (counts.get(vote.target_id) ?? 0) + 1,
                        );
                    }

                    if (counts.size === 0) {
                        setResults([]);
                        setTraitorResults(null);
                        return;
                    }

                    const targetIds = Array.from(counts.keys());

                    const { data: playersData, error: playersError } =
                        await supabase
                            .from('players')
                            .select('id, full_name')
                            .in('id', targetIds);

                    if (playersError) {
                        console.error(
                            'Error loading players for reveal results',
                            playersError,
                        );
                        setErrorMessage(
                            'Error loading players for reveal results.',
                        );
                        return;
                    }

                    const tallies: RoundResultEntry[] = (playersData ?? []).map(
                        (player: { id: string; full_name: string }) => ({
                            playerId: player.id,
                            fullName: player.full_name,
                            voteCount: counts.get(player.id) ?? 0,
                        }),
                    );

                    tallies.sort((a, b) => b.voteCount - a.voteCount);

                    setResults(tallies);
                    setTraitorResults(null);
                }
            } catch (error) {
                console.error('Unexpected error on voting reveal page', error);
                setErrorMessage(
                    'Unexpected error loading voting results. Please try again.',
                );
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
                <div className='text-(--tg-text-muted)'>
                    Loading voting results…
                </div>
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        {errorMessage}
                    </div>
                </div>
            </div>
        );
    }

    if (!round) {
        return null;
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
                            Voting results
                        </h2>
                        <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                            {`Round ${round.round ?? '—'} · ${(() => {
                                switch (round.type) {
                                    case 'banishment_vote':
                                        return 'Banishment vote';
                                    case 'killing_vote':
                                        return 'Killing vote';
                                    default:
                                        return 'Voting round';
                                }
                            })()}`}
                        </p>

                        {results && results.length > 0 ? (
                            <div className='space-y-4 text-sm text-(--tg-text)'>
                                {round.type === 'killing_vote' ? (
                                    <>
                                        <div>
                                            <h3 className='mb-1 text-xs font-semibold tracking-[0.2em] text-(--tg-gold-soft)'>
                                                FAITHFUL RESULT
                                            </h3>
                                            {roundQuestion ? (
                                                <p className='mb-2 text-[11px] text-(--tg-text-muted)'>
                                                    Question:{' '}
                                                    <span className='font-semibold text-(--tg-gold-soft)'>
                                                        {roundQuestion}
                                                    </span>
                                                </p>
                                            ) : null}
                                            <div className='space-y-2'>
                                                {results.map((entry) => (
                                                    <div
                                                        key={entry.playerId}
                                                        className='flex items-center justify-between rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-4 py-2'
                                                    >
                                                        <span className='font-semibold'>
                                                            {entry.fullName}
                                                        </span>
                                                        <span className='text-(--tg-text-muted)'>
                                                            {entry.voteCount}{' '}
                                                            vote
                                                            {entry.voteCount ===
                                                            1
                                                                ? ''
                                                                : 's'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {traitorResults &&
                                        traitorResults.length > 0 ? (
                                            <div>
                                                <h3 className='mt-4 mb-2 text-xs font-semibold tracking-[0.2em] text-(--tg-gold-soft)'>
                                                    TRAITORS&apos; KILL VOTES
                                                </h3>
                                                <div className='space-y-2'>
                                                    S{' '}
                                                    {traitorResults.map(
                                                        (entry) => (
                                                            <div
                                                                key={
                                                                    entry.playerId
                                                                }
                                                                className='flex items-center justify-between rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-4 py-2'
                                                            >
                                                                <span className='font-semibold'>
                                                                    {
                                                                        entry.fullName
                                                                    }
                                                                </span>
                                                                <span className='text-(--tg-text-muted)'>
                                                                    {
                                                                        entry.voteCount
                                                                    }{' '}
                                                                    vote
                                                                    {entry.voteCount ===
                                                                    1
                                                                        ? ''
                                                                        : 's'}
                                                                </span>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}
                                    </>
                                ) : (
                                    <div className='space-y-3'>
                                        {results.map((entry) => (
                                            <div
                                                key={entry.playerId}
                                                className='flex items-center justify-between rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-4 py-2'
                                            >
                                                <span className='font-semibold'>
                                                    {entry.fullName}
                                                </span>
                                                <span className='text-(--tg-text-muted)'>
                                                    {entry.voteCount} vote
                                                    {entry.voteCount === 1
                                                        ? ''
                                                        : 's'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className='text-center text-sm text-(--tg-text-muted)'>
                                No votes were recorded for this round.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VotingRevealPage;
