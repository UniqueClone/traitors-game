'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';
import { GameRound, Player, RoundStatus } from '@/utils/types';

type ActiveRound = Pick<GameRound, 'id' | 'round' | 'type' | 'status'>;

const KILLING_ROUND_QUESTIONS: string[] = [
    'Who do you trust the least in this group?',
    'Who would you be most nervous to be left alone with?',
    'Who do you think is hiding the biggest secret?',
    'Who would you least like to share a room with tonight?',
    'Who do you think is playing the most dangerously?',
    'Who would you choose to remove from the game right now?',
    'Who do you trust the most in this group?',
    'Who do you think is the most likely to be a Traitor?',
    'Who would you want on your team in a high-stakes situation?',
    'Who do you think has the best poker face?',
    'Who would you like to get to know better?',
    'Who would you like to see die next?',
];

const VotingPage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [activeGameId, setActiveGameId] = useState<string | null>(null);
    const [activeRound, setActiveRound] = useState<ActiveRound | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [endgameChoice, setEndgameChoice] = useState<
        'all_found' | 'not_all_found' | ''
    >('');
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [votedForName, setVotedForName] = useState<string | null>(null);
    const [roundQuestion, setRoundQuestion] = useState<string | null>(null);
    const [lastEndgameResult, setLastEndgameResult] = useState<{
        roundNumber: number | null;
        yesCount: number;
        noCount: number;
    } | null>(null);

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
                    setActiveGameId(null);
                    setActiveRound(null);
                    setPlayers([]);
                    setLastEndgameResult(null);
                    setMessage(
                        'No active game is currently configured. Please wait for the host to start a game.',
                    );
                    return;
                }

                setActiveGameId((activeGame as { id: string }).id);

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
                    setLastEndgameResult(null);
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
                    .in('type', [
                        'banishment_vote',
                        'killing_vote',
                        'endgame_vote',
                    ])
                    .maybeSingle();

                if (roundError) {
                    console.error('Error loading current round', roundError);
                }

                if (!round) {
                    if (isMounted) {
                        setActiveRound(null);
                        setPlayers([]);
                        setRoundQuestion(null);
                    }
                } else if (isMounted) {
                    setActiveRound(round as ActiveRound);

                    if (round.type === 'killing_vote') {
                        try {
                            const storageKey = `tg:killingQuestion:${round.id}`;
                            const existing =
                                typeof window !== 'undefined'
                                    ? window.localStorage.getItem(storageKey)
                                    : null;

                            if (existing) {
                                setRoundQuestion(existing);
                            } else {
                                const randomIndex = Math.floor(
                                    Math.random() *
                                        KILLING_ROUND_QUESTIONS.length,
                                );
                                const question =
                                    KILLING_ROUND_QUESTIONS[randomIndex] ??
                                    KILLING_ROUND_QUESTIONS[0] ??
                                    '';
                                setRoundQuestion(question || null);
                                if (
                                    question &&
                                    typeof window !== 'undefined' &&
                                    window.localStorage
                                ) {
                                    window.localStorage.setItem(
                                        storageKey,
                                        question,
                                    );
                                }
                            }
                        } catch (error) {
                            console.error(
                                'Error selecting question for killing round',
                                error,
                            );
                            setRoundQuestion(null);
                        }
                    } else {
                        setRoundQuestion(null);
                    }
                }

                // Load the most recent finished endgame vote result so all
                // players can see the outcome once the host closes it.
                const { data: latestEndgameRound, error: endgameRoundError } =
                    await supabase
                        .from('game_rounds')
                        .select('id, round, type, status')
                        .eq('game_id', activeGame.id)
                        .eq('type', 'endgame_vote')
                        .order('round', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                if (endgameRoundError) {
                    console.error(
                        'Error loading latest endgame vote round',
                        endgameRoundError,
                    );
                }

                if (
                    latestEndgameRound &&
                    (latestEndgameRound as ActiveRound).status ===
                        RoundStatus.Ended &&
                    latestEndgameRound.type === 'endgame_vote'
                ) {
                    const { data: endgameVotes, error: endgameVotesError } =
                        await supabase
                            .from('endgame_votes')
                            .select('all_traitors_found')
                            .eq('round_id', latestEndgameRound.id);

                    if (endgameVotesError) {
                        console.error(
                            'Error loading endgame vote results',
                            endgameVotesError,
                        );
                        if (isMounted) {
                            setLastEndgameResult(null);
                        }
                    } else if (isMounted) {
                        const yesCount =
                            endgameVotes?.filter(
                                (vote) => vote.all_traitors_found === true,
                            ).length ?? 0;
                        const noCount =
                            endgameVotes?.filter(
                                (vote) => vote.all_traitors_found === false,
                            ).length ?? 0;

                        if (yesCount + noCount > 0) {
                            setLastEndgameResult({
                                roundNumber:
                                    (
                                        latestEndgameRound as {
                                            round?: number | null;
                                        }
                                    )?.round ?? null,
                                yesCount,
                                noCount,
                            });
                        } else {
                            setLastEndgameResult(null);
                        }
                    }
                } else if (isMounted) {
                    setLastEndgameResult(null);
                }

                const { data: playersData, error: playersError } =
                    await supabase
                        .from('players')
                        .select('id, full_name, eliminated, has_shield')
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
            if (activeRound.type === 'endgame_vote') {
                if (!activeGameId) {
                    setMessage('No active game found for this end game vote.');
                    return;
                }

                if (!endgameChoice) {
                    alert('Please choose an option before voting.');
                    return;
                }

                const { data: existingEndVote, error: existingEndVoteError } =
                    await supabase
                        .from('endgame_votes')
                        .select('id')
                        .eq('voter_id', user.id)
                        .eq('round_id', activeRound.id)
                        .maybeSingle();

                if (existingEndVoteError) {
                    console.error(
                        'Error checking for existing end game vote',
                        existingEndVoteError,
                    );
                }

                if (existingEndVote) {
                    setMessage(
                        'Your response for this end game vote has already been recorded.',
                    );
                    return;
                }

                const { error: insertEndError } = await supabase
                    .from('endgame_votes')
                    .insert({
                        game_id: activeGameId,
                        round_id: activeRound.id,
                        voter_id: user.id,
                        all_traitors_found: endgameChoice === 'all_found',
                    });

                if (insertEndError) {
                    console.error(
                        'Error casting end game vote',
                        insertEndError,
                    );
                    alert(
                        'There was a problem recording your response. Please try again.',
                    );
                    return;
                }

                setMessage('Your response has been recorded.');
                return;
            }

            if (!selectedPlayerId) {
                alert('Please select a player before casting your vote.');
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

            if (isKillRound) {
                const { data: targetPlayer, error: targetError } =
                    await supabase
                        .from('players')
                        .select('has_shield')
                        .eq('id', selectedPlayerId)
                        .maybeSingle();

                if (targetError) {
                    console.error(
                        'Error checking target shield status',
                        targetError,
                    );
                }

                const targetHasShield =
                    (targetPlayer as { has_shield?: boolean } | null)
                        ?.has_shield === true;

                if (targetHasShield) {
                    alert(
                        'That player currently has a shield and cannot be chosen in this Traitor vote.',
                    );
                    return;
                }
            }

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
                <div className='w-full max-w-md space-y-4'>
                    <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                        <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                            No voting round is currently active. Please wait for
                            the host to start the next round.
                        </div>
                    </div>

                    {lastEndgameResult ? (
                        <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                            <div className='rounded-2xl bg-(--tg-surface) px-6 py-6 text-center shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                                <h2 className='mb-1 text-xs font-semibold tracking-[0.35em] text-(--tg-gold-soft)'>
                                    END GAME VOTE RESULT
                                </h2>
                                <p className='mb-3 text-xs text-(--tg-text-muted)'>
                                    {lastEndgameResult.roundNumber
                                        ? `Round ${lastEndgameResult.roundNumber}`
                                        : 'Most recent end game vote'}
                                </p>
                                <p className='mb-1 text-sm text-(--tg-text)'>
                                    All Traitors are found –{' '}
                                    <span className='font-semibold text-(--tg-gold)'>
                                        {lastEndgameResult.yesCount}
                                    </span>{' '}
                                    vote
                                    {lastEndgameResult.yesCount === 1
                                        ? ''
                                        : 's'}
                                </p>
                                <p className='text-sm text-(--tg-text)'>
                                    Not all Traitors are found –{' '}
                                    <span className='font-semibold text-(--tg-gold)'>
                                        {lastEndgameResult.noCount}
                                    </span>{' '}
                                    vote
                                    {lastEndgameResult.noCount === 1 ? '' : 's'}
                                </p>
                            </div>
                        </div>
                    ) : null}
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

    const isEndgameRound = activeRound.type === 'endgame_vote';

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-md'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-2 text-center text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <h2 className='mb-1 text-center text-2xl font-semibold text-(--tg-text)'>
                            {isEndgameRound ? 'End game vote' : 'Voting round'}
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
                        {activeRound.type === 'killing_vote' &&
                        roundQuestion ? (
                            <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                                Tonight&apos;s question:{' '}
                                <span className='block font-semibold text-(--tg-gold-soft)'>
                                    {roundQuestion}
                                </span>
                                Choose one player as your answer.
                            </p>
                        ) : isEndgameRound ? (
                            <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                                Do you believe all Traitors have been found? All
                                living players vote; your host will decide how
                                to proceed based on the result.
                            </p>
                        ) : (
                            <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                                Make your choice carefully. Your response will
                                be recorded for this round.
                            </p>
                        )}

                        <form className='space-y-6' onSubmit={handleSubmit}>
                            {isEndgameRound ? (
                                <div className='space-y-2'>
                                    <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                        Your answer
                                    </label>
                                    <div className='flex flex-col gap-2 sm:flex-row'>
                                        <button
                                            type='button'
                                            disabled={submitting}
                                            onClick={() =>
                                                setEndgameChoice('all_found')
                                            }
                                            className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                                endgameChoice === 'all_found'
                                                    ? 'border-(--tg-gold) bg-(--tg-gold) text-(--tg-bg) shadow-md'
                                                    : 'border-(--tg-gold)/60 text-(--tg-text) hover:bg-[rgba(0,0,0,0.4)]'
                                            }`}
                                        >
                                            All traitors are found
                                        </button>
                                        <button
                                            type='button'
                                            disabled={submitting}
                                            onClick={() =>
                                                setEndgameChoice(
                                                    'not_all_found',
                                                )
                                            }
                                            className={`flex-1 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                                                endgameChoice ===
                                                'not_all_found'
                                                    ? 'border-(--tg-gold) bg-(--tg-gold) text-(--tg-bg) shadow-md'
                                                    : 'border-(--tg-gold)/60 text-(--tg-text) hover:bg-[rgba(0,0,0,0.4)]'
                                            }`}
                                        >
                                            Not all traitors are found
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                        Your selection
                                    </label>
                                    <select
                                        className='w-full rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                        value={selectedPlayerId}
                                        onChange={(event) =>
                                            setSelectedPlayerId(
                                                event.target.value,
                                            )
                                        }
                                        required
                                    >
                                        <option value='' disabled>
                                            Select a player
                                        </option>
                                        {players
                                            .filter((player) =>
                                                activeRound.type ===
                                                'killing_vote'
                                                    ? !player.has_shield
                                                    : true,
                                            )
                                            .map((player) => (
                                                <option
                                                    key={player.id}
                                                    value={player.id}
                                                >
                                                    {player.full_name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            )}

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
