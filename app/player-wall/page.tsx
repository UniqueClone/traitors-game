'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

import { createClient } from '@/utils/supabase/client';

type Player = {
    id: string;
    full_name: string;
    headshot_url: string;
    eliminated: boolean;
};

export default function PlayerWallPage() {
    const [supabase] = useState(() => createClient());
    const [players, setPlayers] = useState<Player[]>([]);

    useEffect(() => {
        void (async () => {
            try {
                const { data, error: fetchError } = await supabase
                    .from('players')
                    .select('id, full_name, headshot_url, eliminated')
                    .order('full_name', { ascending: true });

                if (fetchError) {
                    console.error('Error loading players', fetchError);
                    return;
                }

                setPlayers(data ?? []);
            } catch (err) {
                console.error('Error loading players', err);
            }
        })();
    }, [supabase]);

    const toggleEliminated = async (id: string, current: boolean) => {
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

    return (
        <main className='min-h-screen bg-(--tg-bg) px-4 py-8'>
            <h1 className='mb-8 text-center text-3xl font-bold text-(--tg-gold)'>
                Player Wall
            </h1>

            <div className='mx-auto grid max-w-5xl grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4'>
                {players.map((player) => (
                    <button
                        key={player.id}
                        type='button'
                        onClick={() =>
                            toggleEliminated(player.id, player.eliminated)
                        }
                        className='group relative flex aspect-3/4 flex-col items-stretch rounded-xl border-4 border-(--tg-gold) bg-(--tg-surface) p-1 shadow-lg transition hover:-translate-y-1 hover:shadow-xl'
                    >
                        <div
                            className={`relative h-full w-full overflow-hidden rounded-lg bg-black/40 transition duration-300 ${player.eliminated ? 'opacity-80 contrast-75 grayscale' : 'opacity-100 grayscale-0'}`}
                        >
                            <Image
                                src={player.headshot_url}
                                alt={player.full_name}
                                fill
                                className='object-cover'
                                sizes='(min-width: 768px) 200px, 33vw'
                            />

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
