'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import BackArrowIcon from '@/app/components/BackArrowIcon';
import { createClient } from '@/utils/supabase/client';
import { Game, GameRound, RoundStatus } from '@/utils/types';

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
                        'id, name, status, cur_round_number, created_at, host, last_revealed_round, kitchen_signal_version',
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
                    .select(
                        'id, game_id, round, type, status, winning_group_index',
                    )
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
            .select('id, game_id, round, type, status, winning_group_index')
            .eq('game_id', gameId)
            .order('round', { ascending: true });

        if (error) {
            console.error('Error reloading rounds', error);
            setErrorMessage('Error reloading rounds from Supabase.');
            return;
        }

        setRounds((data ?? []) as GameRound[]);
    };

    const endActiveRounds = async (gameIdToUse: string) => {
        const { error } = await supabase
            .from('game_rounds')
            .update({ status: RoundStatus.Ended })
            .eq('game_id', gameIdToUse)
            .eq('status', RoundStatus.Active);

        if (error) {
            console.error('Error closing existing active rounds', error);
            setErrorMessage('Error closing existing active rounds.');
            throw error;
        }
    };

    const startRound = async (type: 'banishment_vote' | 'killing_vote') => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            // Close any currently active rounds for this game
            await endActiveRounds(game.id);

            // Create a fresh active round
            const { data: inserted, error: insertError } = await supabase
                .from('game_rounds')
                .insert({
                    game_id: game.id,
                    round: nextRoundNumber,
                    type,
                    status: RoundStatus.Active,
                })
                .select('round')
                .single();

            if (insertError) {
                console.error('Error starting round', insertError);
                setErrorMessage('Error starting new round.');
                return;
            }

            // Update cur_round_number on the game (used to nudge players
            // to the voting page at the start of a new round)
            const { error: gameUpdateError } = await supabase
                .from('games')
                .update({
                    cur_round_number: inserted?.round ?? null,
                })
                .eq('id', game.id);

            if (gameUpdateError) {
                console.error(
                    'Error updating game cur_round_number',
                    gameUpdateError,
                );
                // Non-fatal; keep going
            }

            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error starting round', error);
            if (!errorMessage) {
                setErrorMessage('Unexpected error starting round.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevealResultsToPlayers = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { data: latestEndedRound, error: roundError } = await supabase
                .from('game_rounds')
                .select('id, round, type, status')
                .eq('game_id', game.id)
                .in('type', ['banishment_vote', 'killing_vote'])
                .eq('status', RoundStatus.Ended)
                .order('round', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (roundError) {
                console.error(
                    'Error loading latest ended round for reveal',
                    roundError,
                );
                setErrorMessage('Error loading latest ended round.');
                return;
            }

            if (!latestEndedRound) {
                setErrorMessage(
                    'There is no completed voting round to reveal yet.',
                );
                return;
            }

            const { error: updateError } = await supabase
                .from('games')
                .update({
                    last_revealed_round:
                        (latestEndedRound as { round?: number | null }).round ??
                        null,
                })
                .eq('id', game.id);

            if (updateError) {
                console.error(
                    'Error updating last_revealed_round',
                    updateError,
                );
                setErrorMessage('Error marking round as revealed to players.');
                return;
            }
        } catch (error) {
            console.error('Unexpected error marking results revealed', error);
            setErrorMessage('Unexpected error marking results revealed.');
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

    const handleStartBanishmentVote = async () => {
        await startRound('banishment_vote');
    };

    const handleStartTraitorVote = async () => {
        await startRound('killing_vote');
    };

    const handleStartMinigameRound = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        // Ask the host how many groups they want and whether
        // they should be as even as possible or randomly sized.
        const groupCountInput = window.prompt(
            'How many groups do you want for this minigame? (2-6)',
            '2',
        );

        if (!groupCountInput) {
            return;
        }

        const groupCount = Number.parseInt(groupCountInput, 10);

        if (!Number.isFinite(groupCount) || groupCount < 2 || groupCount > 6) {
            alert('Please enter a number of groups between 2 and 6.');
            return;
        }

        const evenInput = window.prompt(
            'Should groups be as even as possible? (y/n)',
            'y',
        );

        if (!evenInput) {
            return;
        }

        const makeEven = evenInput.trim().toLowerCase().startsWith('y');

        setSubmitting(true);
        setErrorMessage(null);

        try {
            // End any currently active rounds for this game so the
            // minigame is the only active round.
            await endActiveRounds(game.id);

            // Create a new minigame round
            const { data: insertedRound, error: insertError } = await supabase
                .from('game_rounds')
                .insert({
                    game_id: game.id,
                    round: nextRoundNumber,
                    type: 'minigame',
                    status: RoundStatus.Active,
                })
                .select('id')
                .single();

            if (insertError || !insertedRound) {
                console.error('Error starting minigame round', insertError);
                setErrorMessage('Error starting minigame round.');
                return;
            }

            const roundId = (insertedRound as { id: string }).id;

            // Load all non-eliminated players in this game
            const { data: playersData, error: playersError } = await supabase
                .from('players')
                .select('id')
                .eq('game_id', game.id)
                .eq('eliminated', false);

            if (playersError) {
                console.error(
                    'Error loading players for minigame grouping',
                    playersError,
                );
                setErrorMessage('Error loading players for minigame.');
                return;
            }

            const playerIds = (playersData ?? [])
                .map((p: { id: string }) => p.id)
                .filter(Boolean);

            if (!playerIds.length) {
                setErrorMessage('No active players available for minigame.');
                return;
            }

            // Shuffle players for randomised grouping
            const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

            const groups: string[][] = Array.from(
                { length: groupCount },
                () => [],
            );

            if (makeEven) {
                // Round-robin assignment to keep groups as even as possible
                shuffled.forEach((playerId, index) => {
                    const groupIndex = index % groupCount;
                    groups[groupIndex]!.push(playerId);
                });
            } else {
                // Randomly sized groups: each player goes into a random group
                shuffled.forEach((playerId) => {
                    const groupIndex = Math.floor(Math.random() * groupCount);
                    groups[groupIndex]!.push(playerId);
                });
            }

            // Flatten into insert rows, skipping any empty groups
            const rowsToInsert: {
                game_id: string;
                round_id: string;
                player_id: string;
                group_index: number;
            }[] = [];

            groups.forEach((group, index) => {
                group.forEach((playerId) => {
                    rowsToInsert.push({
                        game_id: game.id,
                        round_id: roundId,
                        player_id: playerId,
                        group_index: index + 1,
                    });
                });
            });

            if (!rowsToInsert.length) {
                setErrorMessage('Could not assign players to minigame groups.');
                return;
            }

            const { error: groupsInsertError } = await supabase
                .from('minigame_groups')
                .insert(rowsToInsert);

            if (groupsInsertError) {
                console.error(
                    'Error saving minigame group assignments',
                    groupsInsertError,
                );
                setErrorMessage('Error saving minigame group assignments.');
                return;
            }

            // Bump the minigame signal so PhaseWatcher sends players
            // to the minigame screen.
            const newSignalVersion = (game.minigame_signal_version ?? 0) + 1;
            const { error: signalError } = await supabase
                .from('games')
                .update({ minigame_signal_version: newSignalVersion })
                .eq('id', game.id);

            if (signalError) {
                console.error(
                    'Error updating minigame_signal_version on game',
                    signalError,
                );
                setErrorMessage('Error signalling minigame start to players.');
                return;
            }

            setGame({ ...game, minigame_signal_version: newSignalVersion });
            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error starting minigame round', error);
            setErrorMessage('Unexpected error starting minigame round.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssignAndRevealRoles = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { data: players, error: playersError } = await supabase
                .from('players')
                .select('id, eliminated')
                .eq('game_id', game.id)
                .eq('eliminated', false);

            if (playersError) {
                console.error(
                    'Error loading players for role assignment',
                    playersError,
                );
                setErrorMessage('Error loading players for role assignment.');
                return;
            }

            const activePlayers = (players ?? []) as {
                id: string;
                eliminated: boolean;
            }[];

            if (!activePlayers.length) {
                setErrorMessage('No active players to assign roles to.');
                return;
            }

            const total = activePlayers.length;
            const traitorCount = Math.min(3, total);

            const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
            const traitors = shuffled.slice(0, traitorCount).map((p) => p.id);

            const faithfulIds = shuffled.slice(traitorCount).map((p) => p.id);

            if (traitors.length) {
                const { error: traitorError } = await supabase
                    .from('players')
                    .update({ role: 'traitor' })
                    .in('id', traitors)
                    .eq('game_id', game.id);

                if (traitorError) {
                    console.error('Error setting traitor roles', traitorError);
                    setErrorMessage('Error setting traitor roles.');
                    return;
                }
            }

            if (faithfulIds.length) {
                const { error: faithfulError } = await supabase
                    .from('players')
                    .update({ role: 'faithful' })
                    .in('id', faithfulIds)
                    .eq('game_id', game.id);

                if (faithfulError) {
                    console.error(
                        'Error setting faithful roles',
                        faithfulError,
                    );
                    setErrorMessage('Error setting faithful roles.');
                    return;
                }
            }

            const { error: revealError } = await supabase
                .from('games')
                .update({ roles_revealed: true })
                .eq('id', game.id);

            if (revealError) {
                console.error(
                    'Error marking roles revealed on game',
                    revealError,
                );
                // Non-fatal for role assignment; players can still see roles.
            }
        } catch (error) {
            console.error('Unexpected error assigning roles', error);
            setErrorMessage('Unexpected error assigning roles.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCallEveryoneToKitchen = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const newVersion = (game.kitchen_signal_version ?? 0) + 1;

            const { error: updateError } = await supabase
                .from('games')
                .update({ kitchen_signal_version: newVersion })
                .eq('id', game.id);

            if (updateError) {
                console.error(
                    'Error triggering kitchen signal on game',
                    updateError,
                );
                setErrorMessage(
                    'Error sending “go to kitchen” signal to players.',
                );
                return;
            }

            setGame({ ...game, kitchen_signal_version: newVersion });
        } catch (error) {
            console.error('Unexpected error sending kitchen signal', error);
            setErrorMessage('Unexpected error sending “go to kitchen” signal.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleMarkMinigameWinningGroup = async (round: GameRound) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        if (round.type !== 'minigame') {
            return;
        }

        const input = window.prompt(
            'Which group number won this minigame round?',
            round.winning_group_index ? String(round.winning_group_index) : '1',
        );

        if (!input) {
            return;
        }

        const parsed = Number.parseInt(input, 10);

        if (!Number.isFinite(parsed) || parsed < 1) {
            alert('Please enter a valid group number (1 or higher).');
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { data: existingGroupRows, error: groupCheckError } =
                await supabase
                    .from('minigame_groups')
                    .select('group_index')
                    .eq('round_id', round.id)
                    .eq('group_index', parsed)
                    .limit(1);

            if (groupCheckError) {
                console.error(
                    'Error checking minigame group for winning group',
                    groupCheckError,
                );
                setErrorMessage('Error validating winning group for round.');
                return;
            }

            if (!existingGroupRows || existingGroupRows.length === 0) {
                alert(
                    `No players were assigned to group ${parsed} for this round.`,
                );
                return;
            }

            const { error: updateError } = await supabase
                .from('game_rounds')
                .update({
                    winning_group_index: parsed,
                    status: RoundStatus.Ended,
                })
                .eq('id', round.id);

            if (updateError) {
                console.error(
                    'Error updating winning_group_index for round',
                    updateError,
                );
                setErrorMessage('Error saving winning group for round.');
                return;
            }

            setRounds((prev) =>
                (prev ?? []).map((r) =>
                    r.id === round.id
                        ? {
                              ...r,
                              winning_group_index: parsed,
                              status: RoundStatus.Ended,
                          }
                        : r,
                ),
            );
        } catch (error) {
            console.error('Unexpected error marking winning group', error);
            setErrorMessage('Unexpected error marking winning group.');
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
            console.log('Eliminating player from results:', playerId);
            const { error } = await supabase
                .from('players')
                .update({ eliminated: true })
                .eq('id', playerId)
                .eq('game_id', game.id);

            if (error) {
                console.error('Error eliminating player from results', error);
                setResultsError('Error eliminating player.');
                return;
            }

            console.log('Player eliminated successfully:', playerId);

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
                            {typeof game.cur_round_number === 'number'
                                ? ` · Current round: ${game.cur_round_number}`
                                : ''}
                        </p>

                        {errorMessage ? (
                            <p className='mb-4 text-sm text-(--tg-red-soft)'>
                                {errorMessage}
                            </p>
                        ) : null}

                        <section className='mb-4'>
                            <h3 className='mb-3 text-sm font-semibold text-(--tg-gold-soft)'>
                                Live controls
                            </h3>
                            <p className='mb-3 text-xs text-(--tg-text-muted)'>
                                Use these buttons during the game to start or
                                stop voting rounds, send players to the kitchen,
                                and reveal roles.
                            </p>
                            <div className='mb-4 flex flex-wrap gap-2'>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleStartBanishmentVote()
                                    }
                                    className='inline-flex items-center justify-center rounded-full bg-(--tg-gold) px-4 py-2 text-xs font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft) disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Start banishment vote
                                </button>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleStartTraitorVote()
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold) px-4 py-2 text-xs font-semibold text-(--tg-gold-soft) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Start traitor vote
                                </button>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void endActiveRounds(game.id)
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-red-soft) px-4 py-2 text-xs font-semibold text-(--tg-red-soft) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Close current round
                                </button>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleAssignAndRevealRoles()
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-4 py-2 text-xs font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Assign & reveal roles
                                </button>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleRevealResultsToPlayers()
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-4 py-2 text-xs font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Reveal latest results to players
                                </button>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleCallEveryoneToKitchen()
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-4 py-2 text-xs font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Call everyone to kitchen
                                </button>
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleStartMinigameRound()
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-4 py-2 text-xs font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Start minigame
                                </button>
                            </div>

                            <span className='mb-2 block text-xs font-medium text-(--tg-text-muted)'>
                                Recent rounds for this game:
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
                                                {round.type === 'minigame' && (
                                                    <div className='text-[11px] text-(--tg-text-muted)'>
                                                        Winning group:{' '}
                                                        {round.winning_group_index ??
                                                            'Not set'}
                                                    </div>
                                                )}
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
                                                {round.type === 'minigame' && (
                                                    <button
                                                        type='button'
                                                        disabled={submitting}
                                                        onClick={() =>
                                                            void handleMarkMinigameWinningGroup(
                                                                round,
                                                            )
                                                        }
                                                        className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-3 py-1 text-[11px] font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                    >
                                                        Mark winning group
                                                    </button>
                                                )}
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
