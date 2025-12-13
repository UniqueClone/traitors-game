'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import BackArrowIcon from '@/app/components/BackArrowIcon';
import { createClient } from '@/utils/supabase/client';
import { Game, GameRound, GameStatus, RoundStatus } from '@/utils/types';

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

    type ShieldPlayerEntry = {
        id: string;
        full_name: string;
        has_shield: boolean | null;
    };

    const [shieldPlayers, setShieldPlayers] = useState<ShieldPlayerEntry[]>([]);
    const [showShieldManager, setShowShieldManager] = useState(false);

    type RoundResultEntry = {
        playerId: string;
        fullName: string;
        voteCount: number;
        eliminated: boolean;
    };

    const [resultsRoundId, setResultsRoundId] = useState<string | null>(null);
    const [resultsRoundType, setResultsRoundType] = useState<string | null>(
        null,
    );
    const [roundResults, setRoundResults] = useState<RoundResultEntry[] | null>(
        null,
    );
    const [endgameResults, setEndgameResults] = useState<{
        yesCount: number;
        noCount: number;
    } | null>(null);
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

    const reloadShieldPlayers = useCallback(
        async (gameIdToUse: string) => {
            const { data, error } = await supabase
                .from('players')
                .select('id, full_name, has_shield')
                .eq('game_id', gameIdToUse)
                .order('full_name', { ascending: true });

            if (error) {
                console.error('Error loading players for shields', error);
                setErrorMessage('Error loading players for shields.');
                return;
            }

            setShieldPlayers((data ?? []) as ShieldPlayerEntry[]);
        },
        [supabase],
    );

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
                        'id, name, status, cur_round_number, created_at, host, last_revealed_round, kitchen_signal_version, shield_points_threshold',
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

                await reloadShieldPlayers(gameData.id as string);
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
    }, [gameId, reloadShieldPlayers, router, supabase]);

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

    const handleToggleShieldHolder = async (
        playerId: string,
        hasShield: boolean | null,
    ) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            if (hasShield) {
                const { error } = await supabase
                    .from('players')
                    .update({ has_shield: false })
                    .eq('id', playerId)
                    .eq('game_id', game.id);

                if (error) {
                    console.error('Error removing shield from player', error);
                    setErrorMessage('Error removing shield from player.');
                    return;
                }
            } else {
                const { count, error: countError } = await supabase
                    .from('players')
                    .select('id', { count: 'exact', head: true })
                    .eq('game_id', game.id)
                    .eq('has_shield', true);

                if (countError) {
                    console.error(
                        'Error checking current shield holders',
                        countError,
                    );
                    setErrorMessage('Error checking current shield holders.');
                    return;
                }

                if ((count ?? 0) >= 3) {
                    alert(
                        'There are already three active shields. Remove one before assigning another.',
                    );
                    return;
                }

                const { error } = await supabase
                    .from('players')
                    .update({ has_shield: true })
                    .eq('id', playerId)
                    .eq('game_id', game.id);

                if (error) {
                    console.error('Error assigning shield to player', error);
                    setErrorMessage('Error assigning shield to player.');
                    return;
                }
            }

            await reloadShieldPlayers(game.id);
        } catch (error) {
            console.error('Unexpected error toggling shield holder', error);
            setErrorMessage('Unexpected error updating shield holders.');
        } finally {
            setSubmitting(false);
        }
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

    const handleCloseRound = async (round: GameRound) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { error } = await supabase
                .from('game_rounds')
                .update({ status: RoundStatus.Ended })
                .eq('id', round.id);

            if (error) {
                console.error('Error closing round', error);
                setErrorMessage('Error closing round.');
                return;
            }

            if (round.type === 'killing_vote') {
                const { error: shieldClearError } = await supabase
                    .from('players')
                    .update({ has_shield: false })
                    .eq('game_id', game.id)
                    .eq('has_shield', true);

                if (shieldClearError) {
                    console.error(
                        'Error clearing shields after killing vote',
                        shieldClearError,
                    );
                    // Non-fatal; keep going.
                }
            }

            if (round.type === 'endgame_vote') {
                // Resolve the special end game vote once it is closed
                await evaluateEndgameVote(round);
            }

            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error closing round', error);
            setErrorMessage('Unexpected error closing round.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseCurrentRound = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        const activeRound = rounds.find(
            (round) => round.status === RoundStatus.Active,
        );

        if (!activeRound) {
            setErrorMessage('There is no active round to close.');
            return;
        }

        await handleCloseRound(activeRound);
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
                const totalPlayers = shuffled.length;

                const defaultSize = Math.floor(totalPlayers / groupCount) || 1;
                const defaultSizes = Array.from({ length: groupCount }, () =>
                    String(defaultSize),
                ).join(', ');

                const sizesInput = window.prompt(
                    `You have ${totalPlayers} active players. Enter ${groupCount} group sizes separated by commas (must sum to ${totalPlayers}).`,
                    defaultSizes,
                );

                if (!sizesInput) {
                    return;
                }

                const sizeParts = sizesInput
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean);

                if (sizeParts.length !== groupCount) {
                    alert(
                        `Please provide exactly ${groupCount} group sizes, separated by commas.`,
                    );
                    return;
                }

                const groupSizes = sizeParts.map((part) =>
                    Number.parseInt(part, 10),
                );

                if (
                    groupSizes.some(
                        (size) => !Number.isFinite(size) || size < 1,
                    )
                ) {
                    alert('Each group size must be a positive whole number.');
                    return;
                }

                const totalSpecified = groupSizes.reduce(
                    (sum, size) => sum + size,
                    0,
                );

                if (totalSpecified !== totalPlayers) {
                    alert(
                        `Group sizes must add up to ${totalPlayers} (currently ${totalSpecified}).`,
                    );
                    return;
                }

                let cursor = 0;
                groupSizes.forEach((size, groupIndex) => {
                    for (let i = 0; i < size; i += 1) {
                        groups[groupIndex]!.push(shuffled[cursor]!);
                        cursor += 1;
                    }
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

    const handleClearRoles = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { error: clearError } = await supabase
                .from('players')
                .update({ role: null })
                .eq('game_id', game.id);

            if (clearError) {
                console.error('Error clearing player roles', clearError);
                setErrorMessage('Error clearing player roles.');
                return;
            }

            const { error: gameUpdateError } = await supabase
                .from('games')
                .update({ roles_revealed: false })
                .eq('id', game.id);

            if (gameUpdateError) {
                console.error(
                    'Error resetting roles_revealed on game',
                    gameUpdateError,
                );
                // Non-fatal for clearing roles.
            }
        } catch (error) {
            console.error('Unexpected error clearing roles', error);
            setErrorMessage('Unexpected error clearing roles.');
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

    const checkGameEndOrTriggerEndgameVote = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        if (game.status !== GameStatus.Active) {
            return;
        }

        try {
            const { data: playersData, error: playersError } = await supabase
                .from('players')
                .select('id, role, eliminated')
                .eq('game_id', game.id);

            if (playersError) {
                console.error(
                    'Error loading players for end game check',
                    playersError,
                );
                setErrorMessage(
                    'Error checking players when deciding whether to end the game.',
                );
                return;
            }

            const players = (playersData ?? []) as {
                id: string;
                role: string | null;
                eliminated: boolean;
            }[];

            const livingPlayers = players.filter(
                (player) => !player.eliminated,
            );
            const livingTotal = livingPlayers.length;

            if (livingTotal === 0) {
                return;
            }

            const totalTraitors = players.filter(
                (player) => (player.role ?? '').toLowerCase() === 'traitor',
            ).length;

            if (totalTraitors === 0) {
                // Roles not assigned yet or no traitors defined; do not end the game.
                return;
            }

            const livingTraitors = livingPlayers.filter(
                (player) => (player.role ?? '').toLowerCase() === 'traitor',
            ).length;
            const livingFaithful = livingPlayers.filter(
                (player) => (player.role ?? '').toLowerCase() === 'faithful',
            ).length;

            if (livingTraitors === 0) {
                // All traitors have been eliminated – Faithful win.
                const { error: gameUpdateError } = await supabase
                    .from('games')
                    .update({ status: GameStatus.Ended })
                    .eq('id', game.id);

                if (gameUpdateError) {
                    console.error(
                        'Error marking game ended after all traitors eliminated',
                        gameUpdateError,
                    );
                    setErrorMessage(
                        'Error marking game ended after all traitors were eliminated.',
                    );
                    return;
                }

                setGame({ ...game, status: GameStatus.Ended });
                setErrorMessage(
                    'Game ended: all Traitors have been eliminated. Faithful win.',
                );
                return;
            }

            if (livingFaithful === 0) {
                // Only traitors remain – Traitors win.
                const { error: gameUpdateError } = await supabase
                    .from('games')
                    .update({ status: GameStatus.Ended })
                    .eq('id', game.id);

                if (gameUpdateError) {
                    console.error(
                        'Error marking game ended when only traitors remain',
                        gameUpdateError,
                    );
                    setErrorMessage(
                        'Error marking game ended when only Traitors remain.',
                    );
                    return;
                }

                setGame({ ...game, status: GameStatus.Ended });
                setErrorMessage(
                    'Game ended: only Traitors remain. Traitors win.',
                );
                return;
            }
        } catch (error) {
            console.error(
                'Unexpected error checking end game conditions',
                error,
            );
            setErrorMessage('Unexpected error checking end game conditions.');
        }
    };

    const evaluateEndgameVote = async (round: GameRound) => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        try {
            const { data: votesData, error: votesError } = await supabase
                .from('endgame_votes')
                .select('voter_id, all_traitors_found')
                .eq('round_id', round.id);

            if (votesError) {
                console.error(
                    'Error loading endgame_votes for round',
                    votesError,
                );
                setErrorMessage('Error loading end game votes for this round.');
                return;
            }

            const votes = (votesData ?? []) as {
                voter_id: string;
                all_traitors_found: boolean | null;
            }[];

            if (!votes.length) {
                setErrorMessage(
                    'No end game votes have been recorded yet. The game will continue.',
                );
                return;
            }

            let yesCount = 0;
            let noCount = 0;
            for (const vote of votes) {
                if (vote.all_traitors_found) {
                    yesCount += 1;
                } else {
                    noCount += 1;
                }
            }

            if (yesCount <= noCount) {
                // Majority did not say all traitors are found – game continues.
                setErrorMessage(
                    'Players voted that not all Traitors have been found. The game continues.',
                );
                return;
            }

            // Players voted "all Traitors are found" – verify whether that is correct.
            const { data: playersData, error: playersError } = await supabase
                .from('players')
                .select('id, role, eliminated')
                .eq('game_id', game.id);

            if (playersError) {
                console.error(
                    'Error loading players to resolve end game vote',
                    playersError,
                );
                setErrorMessage(
                    'Error checking player roles when resolving end game vote.',
                );
                return;
            }

            const players = (playersData ?? []) as {
                id: string;
                role: string | null;
                eliminated: boolean;
            }[];

            const totalTraitors = players.filter(
                (player) => (player.role ?? '').toLowerCase() === 'traitor',
            ).length;

            if (totalTraitors === 0) {
                setErrorMessage(
                    'End game vote could not be resolved because no Traitors are defined for this game.',
                );
                return;
            }

            const livingTraitors = players.filter(
                (player) =>
                    !player.eliminated &&
                    (player.role ?? '').toLowerCase() === 'traitor',
            ).length;

            const allTraitorsEliminated = livingTraitors === 0;

            const { error: gameUpdateError } = await supabase
                .from('games')
                .update({ status: GameStatus.Ended })
                .eq('id', game.id);

            if (gameUpdateError) {
                console.error(
                    'Error marking game ended after resolving end game vote',
                    gameUpdateError,
                );
                setErrorMessage(
                    'Error marking game as ended after resolving end game vote.',
                );
                return;
            }

            setGame({ ...game, status: GameStatus.Ended });

            if (allTraitorsEliminated) {
                setErrorMessage(
                    'Game ended: players correctly found all Traitors. Faithful win.',
                );
            } else {
                setErrorMessage(
                    'Game ended: players were wrong, Traitors remain. Traitors win.',
                );
            }
        } catch (error) {
            console.error('Unexpected error resolving end game vote', error);
            setErrorMessage('Unexpected error resolving end game vote.');
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
        setResultsRoundType(round.type ?? null);
        setRoundResults(null);
        setEndgameResults(null);
        setResultsError(null);
        setResultsLoading(true);

        try {
            if (round.type === 'endgame_vote') {
                const { data: endgameVotes, error: endgameError } =
                    await supabase
                        .from('endgame_votes')
                        .select('all_traitors_found')
                        .eq('round_id', round.id);

                if (endgameError) {
                    console.error(
                        'Error loading endgame_votes for round',
                        endgameError,
                    );
                    setResultsError(
                        'Error loading end game votes for this round.',
                    );
                    return;
                }

                const votes = (endgameVotes ?? []) as {
                    all_traitors_found: boolean | null;
                }[];

                if (!votes.length) {
                    setEndgameResults({ yesCount: 0, noCount: 0 });
                    return;
                }

                let yesCount = 0;
                let noCount = 0;
                for (const vote of votes) {
                    if (vote.all_traitors_found) {
                        yesCount += 1;
                    } else {
                        noCount += 1;
                    }
                }

                setEndgameResults({ yesCount, noCount });
                return;
            }

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

            // After each elimination, check whether the game should end
            // or whether an end game vote round should be triggered.
            await checkGameEndOrTriggerEndgameVote();
        } catch (error) {
            console.error('Unexpected error eliminating player', error);
            setResultsError('Unexpected error eliminating player.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStartEndgameVote = async () => {
        if (!game || !currentUserId || game.host !== currentUserId) {
            return;
        }

        if (game.status !== GameStatus.Active) {
            setErrorMessage(
                'End game vote is only available while the game is active.',
            );
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { data: playersData, error: playersError } = await supabase
                .from('players')
                .select('id, role, eliminated')
                .eq('game_id', game.id);

            if (playersError) {
                console.error(
                    'Error loading players for manual end game vote',
                    playersError,
                );
                setErrorMessage(
                    'Error loading players when starting an end game vote.',
                );
                return;
            }

            const players = (playersData ?? []) as {
                id: string;
                role: string | null;
                eliminated: boolean;
            }[];

            const livingPlayers = players.filter(
                (player) => !player.eliminated,
            );
            const livingTotal = livingPlayers.length;

            if (livingTotal > 4) {
                setErrorMessage(
                    'End game vote is intended for 4 or fewer remaining players. Eliminate more players first.',
                );
                return;
            }

            const totalTraitors = players.filter(
                (player) => (player.role ?? '').toLowerCase() === 'traitor',
            ).length;

            if (totalTraitors === 0) {
                setErrorMessage(
                    'Cannot start an end game vote because no Traitors are defined for this game.',
                );
                return;
            }

            const { data: existingEndgameRound, error: roundError } =
                await supabase
                    .from('game_rounds')
                    .select('id')
                    .eq('game_id', game.id)
                    .eq('status', RoundStatus.Active)
                    .eq('type', 'endgame_vote')
                    .maybeSingle();

            if (roundError) {
                console.error(
                    'Error checking for existing endgame_vote round',
                    roundError,
                );
                setErrorMessage(
                    'Error checking for an existing end game vote round.',
                );
                return;
            }

            if (existingEndgameRound) {
                setErrorMessage('An end game vote round is already active.');
                return;
            }

            try {
                await endActiveRounds(game.id);
            } catch (error) {
                console.error(
                    'Error closing active rounds before starting endgame_vote',
                    error,
                );
                setErrorMessage(
                    'Error closing existing rounds before starting an end game vote.',
                );
                return;
            }

            const { data: insertedRound, error: insertError } = await supabase
                .from('game_rounds')
                .insert({
                    game_id: game.id,
                    round: nextRoundNumber,
                    type: 'endgame_vote',
                    status: RoundStatus.Active,
                })
                .select('round')
                .single();

            if (insertError || !insertedRound) {
                console.error('Error starting endgame_vote round', insertError);
                setErrorMessage('Error starting end game vote round.');
                return;
            }

            const newRoundNumber = (insertedRound as { round?: number | null })
                .round;

            const { error: gameRoundUpdateError } = await supabase
                .from('games')
                .update({
                    cur_round_number: newRoundNumber ?? null,
                })
                .eq('id', game.id);

            if (gameRoundUpdateError) {
                console.error(
                    'Error updating game cur_round_number for endgame_vote',
                    gameRoundUpdateError,
                );
                // Non-fatal; keep going.
            }

            await refreshRounds();
        } catch (error) {
            console.error('Unexpected error starting end game vote', error);
            setErrorMessage('Unexpected error starting end game vote.');
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
                                and reveal roles. When an end game vote round is
                                closed, its final yes/no tally will appear on
                                the players&apos; voting screen.
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
                                        void handleCloseCurrentRound()
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
                                    onClick={() => void handleClearRoles()}
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-red-soft)/70 px-4 py-2 text-xs font-semibold text-(--tg-red-soft) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Clear roles
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
                                <button
                                    type='button'
                                    disabled={submitting}
                                    onClick={() =>
                                        void handleStartEndgameVote()
                                    }
                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-4 py-2 text-xs font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Start end game vote
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
                                                            round,
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
                                                setResultsRoundType(null);
                                                setRoundResults(null);
                                                setEndgameResults(null);
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
                                    ) : resultsRoundType === 'endgame_vote' ? (
                                        <div>
                                            {endgameResults &&
                                            (endgameResults.yesCount > 0 ||
                                                endgameResults.noCount > 0) ? (
                                                <>
                                                    <p className='mb-1 text-(--tg-text-muted)'>
                                                        End game vote tallies:
                                                    </p>
                                                    <p>
                                                        <span className='font-semibold text-(--tg-gold-soft)'>
                                                            All Traitors are
                                                            found
                                                        </span>{' '}
                                                        –{' '}
                                                        {
                                                            endgameResults.yesCount
                                                        }{' '}
                                                        vote
                                                        {endgameResults.yesCount ===
                                                        1
                                                            ? ''
                                                            : 's'}
                                                    </p>
                                                    <p>
                                                        <span className='font-semibold text-(--tg-text)'>
                                                            Not all Traitors are
                                                            found
                                                        </span>{' '}
                                                        –{' '}
                                                        {endgameResults.noCount}{' '}
                                                        vote
                                                        {endgameResults.noCount ===
                                                        1
                                                            ? ''
                                                            : 's'}
                                                    </p>
                                                </>
                                            ) : (
                                                <p className='text-(--tg-text-muted)'>
                                                    No end game votes have been
                                                    recorded for this round yet.
                                                </p>
                                            )}
                                        </div>
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

                            <section className='mt-4'>
                                <div className='mb-2 flex items-center justify-between'>
                                    <h3 className='text-sm font-semibold text-(--tg-gold-soft)'>
                                        Shield management
                                    </h3>
                                    <button
                                        type='button'
                                        className='text-[11px] text-(--tg-text-muted) hover:text-(--tg-gold-soft)'
                                        onClick={() =>
                                            setShowShieldManager(
                                                (open) => !open,
                                            )
                                        }
                                    >
                                        {showShieldManager ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <p className='mb-2 text-xs text-(--tg-text-muted)'>
                                    Manually adjust who currently holds shields.
                                    At most three players can have an active
                                    shield at any time. Shields are not
                                    automatically awarded from minigames – you
                                    choose who holds them.
                                </p>

                                {showShieldManager && (
                                    <div className='rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-3 py-2'>
                                        <div className='mb-2 flex items-center justify-between'>
                                            <span className='text-xs font-semibold text-(--tg-gold-soft)'>
                                                Shield holders
                                            </span>
                                            <span className='text-[11px] text-(--tg-text-muted)'>
                                                {
                                                    shieldPlayers.filter(
                                                        (p) => p.has_shield,
                                                    ).length
                                                }{' '}
                                                / 3 active
                                            </span>
                                        </div>
                                        {shieldPlayers.length === 0 ? (
                                            <p className='text-[11px] text-(--tg-text-muted)'>
                                                No players loaded yet.
                                            </p>
                                        ) : (
                                            <div className='max-h-40 space-y-1 overflow-y-auto pr-1'>
                                                {shieldPlayers.map((player) => (
                                                    <div
                                                        key={player.id}
                                                        className='flex items-center justify-between gap-2 rounded-md bg-[rgba(0,0,0,0.4)] px-3 py-1.5'
                                                    >
                                                        <div>
                                                            <div className='text-xs font-medium text-(--tg-text)'>
                                                                {
                                                                    player.full_name
                                                                }
                                                            </div>
                                                            <div className='text-[10px] text-(--tg-text-muted)'>
                                                                {player.has_shield
                                                                    ? 'Currently holds a shield.'
                                                                    : 'No shield.'}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type='button'
                                                            disabled={
                                                                submitting
                                                            }
                                                            onClick={() =>
                                                                void handleToggleShieldHolder(
                                                                    player.id,
                                                                    player.has_shield,
                                                                )
                                                            }
                                                            className={
                                                                player.has_shield
                                                                    ? 'inline-flex items-center justify-center rounded-full border border-(--tg-red-soft) px-3 py-1 text-[11px] font-semibold text-(--tg-red-soft) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                                    : 'inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-3 py-1 text-[11px] font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                            }
                                                        >
                                                            {player.has_shield
                                                                ? 'Remove shield'
                                                                : 'Give shield'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
};

export default GameManagePage;
