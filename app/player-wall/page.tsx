'use client';

import Image from 'next/image';
import { useState } from 'react';

type Player = {
    id: number;
    name: string;
    imageUrl: string;
    eliminated: boolean;
};

// TODO - fetch players from db
const initialPlayers: Player[] = [
    {
        id: 1,
        name: 'Ryan',
        imageUrl: '/players/player-1.jpg',
        eliminated: false,
    },
    {
        id: 2,
        name: 'Niamh D',
        imageUrl: '/players/player-2.jpg',
        eliminated: false,
    },
    {
        id: 3,
        name: 'Player 3',
        imageUrl: '/players/player-3.jpg',
        eliminated: false,
    },
    {
        id: 4,
        name: 'Player 4',
        imageUrl: '/players/player-4.jpg',
        eliminated: false,
    },
    {
        id: 5,
        name: 'Player 5',
        imageUrl: '/players/player-5.jpg',
        eliminated: false,
    },
];

export default function PlayerWallPage() {
    const [players, setPlayers] = useState<Player[]>(initialPlayers);

    // TODO - trigger elimination with realtime events
    const toggleEliminated = (id: number) => {
        setPlayers((prev) =>
            prev.map((player) =>
                player.id === id
                    ? {
                          ...player,
                          eliminated: !player.eliminated,
                      }
                    : player,
            ),
        );
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
                        onClick={() => toggleEliminated(player.id)}
                        className='group relative flex aspect-3/4 flex-col items-stretch rounded-xl border-4 border-(--tg-gold) bg-(--tg-surface) p-1 shadow-lg transition hover:-translate-y-1 hover:shadow-xl'
                    >
                        <div className='relative h-full w-full overflow-hidden rounded-lg bg-black/40'>
                            <Image
                                src={player.imageUrl}
                                alt={player.name}
                                fill
                                className='object-cover'
                                sizes='(min-width: 768px) 200px, 33vw'
                            />

                            <div
                                className={`pointer-events-none absolute inset-0 flex items-center justify-center transition duration-5000 ${player.eliminated ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
                            >
                                {/* Two red marks for the x */}
                                <div className='absolute h-[30px] w-[150%] rotate-45 bg-(--tg-red-soft) shadow-[0_0_10px_rgba(0,0,0,0.6)]' />
                                <div className='absolute h-[30px] w-[150%] -rotate-45 bg-(--tg-red-soft) shadow-[0_0_10px_rgba(0,0,0,0.6)]' />
                            </div>
                            <div className='pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent' />
                        </div>

                        <span className='pointer-events-none mt-2 block text-center text-sm font-semibold text-(--tg-text)'>
                            {player.name}
                        </span>
                    </button>
                ))}
            </div>
        </main>
    );
}
