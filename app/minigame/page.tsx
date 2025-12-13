'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/utils/supabase/client';
import { RoundStatus } from '@/utils/types';

const MinigamePage = () => {
    const [supabase] = useState(() => createClient());
    const [groupIndex, setGroupIndex] = useState<number | null>(null);
    const [roundNumber, setRoundNumber] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();

                if (!user) {
                    setMessage(
                        'You must be signed in to view minigame groups.',
                    );
                    setLoading(false);
                    return;
                }

                const { data: activeGame, error: gameError } = await supabase
                    .from('games')
                    .select('id')
                    .eq('status', 'active')
                    .maybeSingle();

                if (gameError) {
                    console.error(
                        'Error loading active game for minigame',
                        gameError,
                    );
                    setMessage('Error loading active game.');
                    setLoading(false);
                    return;
                }

                if (!activeGame) {
                    setMessage('No active game is currently configured.');
                    setLoading(false);
                    return;
                }

                const { data: round, error: roundError } = await supabase
                    .from('game_rounds')
                    .select('id, round, status')
                    .eq('game_id', activeGame.id)
                    .eq('type', 'minigame')
                    .eq('status', RoundStatus.Active)
                    .order('round', { ascending: false })
                    .maybeSingle();

                if (roundError) {
                    console.error('Error loading minigame round', roundError);
                    setMessage('Error loading minigame round.');
                    setLoading(false);
                    return;
                }

                if (!round) {
                    setMessage('There is no active minigame round right now.');
                    setLoading(false);
                    return;
                }

                setRoundNumber(
                    (round as { round: number | null }).round ?? null,
                );

                const { data: assignment, error: assignmentError } =
                    await supabase
                        .from('minigame_groups')
                        .select('group_index')
                        .eq('round_id', (round as { id: string }).id)
                        .eq('player_id', user.id)
                        .maybeSingle();

                if (assignmentError) {
                    console.error(
                        'Error loading minigame assignment',
                        assignmentError,
                    );
                    setMessage('Error loading your group assignment.');
                    setLoading(false);
                    return;
                }

                if (!assignment) {
                    setMessage(
                        'You do not appear to be assigned to a group for this minigame.',
                    );
                    setLoading(false);
                    return;
                }

                setGroupIndex(
                    (assignment as { group_index: number }).group_index,
                );
                setLoading(false);
            } catch (error) {
                console.error('Unexpected error loading minigame page', error);
                setMessage('Unexpected error loading minigame information.');
                setLoading(false);
            }
        })();
    }, [supabase]);

    if (loading) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='text-(--tg-text-muted)'>Loading minigame…</div>
            </div>
        );
    }

    if (message && groupIndex === null) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='w-full max-w-md rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 text-center text-(--tg-text-muted) shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        {message}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-md'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-10 text-center shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-3 text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <p className='mb-2 text-xs tracking-[0.25em] text-(--tg-text-muted) uppercase'>
                            Minigame groups
                        </p>
                        {roundNumber !== null ? (
                            <p className='mb-1 text-xs text-(--tg-text-muted)'>
                                Round {roundNumber}
                            </p>
                        ) : null}
                        <p className='mb-6 text-3xl font-extrabold text-(--tg-gold) sm:text-4xl'>
                            Group {groupIndex}
                        </p>
                        <p className='text-xs text-(--tg-text-muted)'>
                            Stay with the other players in your group until the
                            host explains the rules of this minigame.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MinigamePage;
