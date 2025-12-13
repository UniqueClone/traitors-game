'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';
import { Game, GameStatus } from '@/utils/types';

const GamesAdminPage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [games, setGames] = useState<Game[]>([]);
    const [newGameName, setNewGameName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadGames = async (userId: string) => {
        const { data, error } = await supabase
            .from('games')
            .select('id, name, status, cur_round_number, created_at, host')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading games', error);
            setErrorMessage('Error loading games from Supabase.');
            return;
        }

        setCurrentUserId(userId);
        setGames(data ?? []);
    };

    useEffect(() => {
        void (async () => {
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

                await loadGames(user.id);
            } catch (error) {
                console.error(
                    'Unexpected error loading games admin page',
                    error,
                );
                setErrorMessage('Unexpected error loading games.');
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, supabase]);

    const refreshGames = async () => {
        if (!currentUserId) return;
        await loadGames(currentUserId);
    };

    const handleCreateGame = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!newGameName.trim()) {
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { error } = await supabase.from('games').insert({
                name: newGameName.trim(),
                status: GameStatus.Pending,
                host: currentUserId,
            });

            if (error) {
                console.error('Error creating game', error);
                setErrorMessage('Error creating game.');
                return;
            }

            setNewGameName('');
            await refreshGames();
        } catch (error) {
            console.error('Unexpected error creating game', error);
            setErrorMessage('Unexpected error creating game.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSetActive = async (gameId: string) => {
        setSubmitting(true);
        setErrorMessage(null);

        try {
            // End all other games
            const { error: endError } = await supabase
                .from('games')
                .update({ status: GameStatus.Ended })
                .neq('id', gameId);

            if (endError) {
                console.error('Error ending games', endError);
                setErrorMessage('Error ending other games.');
                return;
            }

            // Set the selected game as active
            const { error: activateError } = await supabase
                .from('games')
                .update({ status: GameStatus.Active })
                .eq('id', gameId);

            if (activateError) {
                console.error('Error setting game active', activateError);
                setErrorMessage('Error setting game active.');
                return;
            }

            await refreshGames();
        } catch (error) {
            console.error('Unexpected error setting active game', error);
            setErrorMessage('Unexpected error setting active game.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEnd = async (gameId: string) => {
        setSubmitting(true);
        setErrorMessage(null);

        try {
            const { error } = await supabase
                .from('games')
                .update({ status: GameStatus.Ended })
                .eq('id', gameId);

            if (error) {
                console.error('Error ending game', error);
                setErrorMessage('Error ending game.');
                return;
            }

            await refreshGames();
        } catch (error) {
            console.error('Unexpected error ending game', error);
            setErrorMessage('Unexpected error ending game.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
                <div className='text-(--tg-text-muted)'>Loading games…</div>
            </div>
        );
    }

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-2xl'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-2 text-center text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <h2 className='mb-6 text-center text-2xl font-semibold text-(--tg-text)'>
                            Manage games
                        </h2>

                        <form
                            className='mb-8 space-y-3'
                            onSubmit={handleCreateGame}
                        >
                            <label className='block text-sm font-medium text-(--tg-gold-soft)'>
                                New game name
                            </label>
                            <div className='flex flex-col gap-3 sm:flex-row'>
                                <input
                                    type='text'
                                    value={newGameName}
                                    onChange={(event) =>
                                        setNewGameName(event.target.value)
                                    }
                                    placeholder='e.g. New Year Game Night'
                                    className='flex-1 rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                />
                                <button
                                    type='submit'
                                    disabled={submitting || !newGameName.trim()}
                                    className='inline-flex items-center justify-center rounded-full bg-(--tg-gold) px-4 py-2 text-sm font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft) disabled:cursor-not-allowed disabled:opacity-60'
                                >
                                    Create game
                                </button>
                            </div>
                            <p className='text-xs text-(--tg-text-muted)'>
                                New games start in a pending state. Use the
                                controls below to set one active at a time.
                            </p>
                        </form>

                        {errorMessage ? (
                            <p className='mb-4 text-sm text-(--tg-red-soft)'>
                                {errorMessage}
                            </p>
                        ) : null}

                        <div className='space-y-3'>
                            {games.length === 0 ? (
                                <p className='text-sm text-(--tg-text-muted)'>
                                    No games created yet.
                                </p>
                            ) : (
                                games.map((game) => (
                                    <div
                                        key={game.id}
                                        className='flex flex-col gap-2 rounded-lg border border-[rgba(0,0,0,0.6)] bg-(--tg-surface-muted) px-4 py-3 text-sm text-(--tg-text) sm:flex-row sm:items-center sm:justify-between'
                                    >
                                        <div>
                                            <div className='font-semibold'>
                                                {game.name}
                                            </div>
                                            <div className='text-xs text-(--tg-text-muted)'>
                                                Status: {game.status}
                                                {game.status ===
                                                GameStatus.Active
                                                    ? ' (current active game)'
                                                    : ''}
                                            </div>
                                        </div>
                                        <div className='flex flex-wrap gap-2 pt-1 sm:justify-end sm:pt-0'>
                                            <button
                                                type='button'
                                                disabled={
                                                    submitting ||
                                                    game.status ===
                                                        GameStatus.Active ||
                                                    !currentUserId ||
                                                    game.host !== currentUserId
                                                }
                                                onClick={() =>
                                                    void handleSetActive(
                                                        game.id,
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
                                                    !currentUserId ||
                                                    game.host !== currentUserId
                                                }
                                                onClick={() =>
                                                    void handleEnd(game.id)
                                                }
                                                className='inline-flex items-center justify-center rounded-full border border-(--tg-red-soft) px-3 py-1 text-[11px] font-semibold text-(--tg-red-soft) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                            >
                                                End game
                                            </button>
                                            {currentUserId &&
                                            game.host === currentUserId ? (
                                                <button
                                                    type='button'
                                                    disabled={submitting}
                                                    onClick={() =>
                                                        router.push(
                                                            `/host/games/${game.id}`,
                                                        )
                                                    }
                                                    className='inline-flex items-center justify-center rounded-full border border-(--tg-gold)/60 px-3 py-1 text-[11px] font-semibold text-(--tg-text) transition hover:bg-[rgba(0,0,0,0.4)] disabled:cursor-not-allowed disabled:opacity-60'
                                                >
                                                    Manage
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GamesAdminPage;
