'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/utils/supabase/client';

const KitchenPage = () => {
    const [supabase] = useState(() => createClient());
    const [playerName, setPlayerName] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();

                if (!user) {
                    return;
                }

                const { data: player } = await supabase
                    .from('players')
                    .select('full_name')
                    .eq('id', user.id)
                    .maybeSingle();

                if (player && player.full_name) {
                    setPlayerName((player.full_name as string).split(' ')[0]);
                }
            } catch (error) {
                console.error('Error loading player for kitchen screen', error);
            }
        })();
    }, [supabase]);

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-md'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-10 text-center shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-3 text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>
                        <p className='mb-2 text-xs tracking-[0.25em] text-(--tg-text-muted) uppercase'>
                            Host message
                        </p>
                        <p className='mb-6 text-3xl font-extrabold text-(--tg-gold) sm:text-4xl'>
                            Everyone go to the kitchen
                        </p>
                        {playerName ? (
                            <p className='text-xs text-(--tg-text-muted)'>
                                Stay with the group {playerName}, and wait for
                                further instructions from your host.
                            </p>
                        ) : (
                            <p className='text-xs text-(--tg-text-muted)'>
                                Stay with the group and wait for further
                                instructions from your host.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KitchenPage;
