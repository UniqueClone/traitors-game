'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';

// Global watcher that nudges players to voting / reveal / profile
// when the host starts a new round, reveals results, or reveals roles.
// It only redirects once per phase change by tracking the last values
// in localStorage.

const LAST_ROUND_KEY = 'tg:lastSeenRoundNumber';
const LAST_REVEALED_ROUND_KEY = 'tg:lastSeenRevealedRoundNumber';
const LAST_ROLES_REVEALED_KEY = 'tg:lastSeenRolesRevealed';

export function PhaseWatcher() {
    const router = useRouter();
    const pathname = usePathname();
    const [supabase] = useState(() => createClient());

    useEffect(() => {
        let isMounted = true;

        const load = async () => {
            try {
                const {
                    data: { user },
                } = await supabase.auth.getUser();

                if (!user || !isMounted) {
                    return;
                }

                const { data: activeGame, error: activeGameError } =
                    await supabase
                        .from('games')
                        .select(
                            'id, status, cur_round_number, roles_revealed, last_revealed_round',
                        )
                        .eq('status', 'active')
                        .maybeSingle();

                if (activeGameError) {
                    console.error(
                        'Error loading active game in PhaseWatcher',
                        activeGameError,
                    );
                    return;
                }

                if (!activeGame) {
                    return;
                }

                const currentRoundNumber: number | null =
                    (activeGame as { cur_round_number?: number | null })
                        .cur_round_number ?? null;
                const lastRevealedRound: number | null =
                    (activeGame as { last_revealed_round?: number | null })
                        .last_revealed_round ?? null;
                const rolesRevealed: boolean = Boolean(
                    (activeGame as { roles_revealed?: boolean | null })
                        .roles_revealed,
                );

                // Use localStorage only in browser
                const storedRound =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(LAST_ROUND_KEY)
                        : null;
                const storedRevealedRound =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(LAST_REVEALED_ROUND_KEY)
                        : null;
                const storedRolesRevealed =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(LAST_ROLES_REVEALED_KEY)
                        : null;

                const lastSeenRound = storedRound
                    ? Number.parseInt(storedRound, 10)
                    : null;
                const lastSeenRevealedRound = storedRevealedRound
                    ? Number.parseInt(storedRevealedRound, 10)
                    : null;
                const lastSeenRolesRevealed = storedRolesRevealed === 'true';

                // 1) Roles revealed → send everyone to profile once
                if (rolesRevealed && !lastSeenRolesRevealed) {
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(
                            LAST_ROLES_REVEALED_KEY,
                            'true',
                        );
                    }
                    if (pathname !== '/profile') {
                        router.push('/profile');
                    }
                    return;
                }

                // 2) New active round number → send to voting once
                if (
                    currentRoundNumber !== null &&
                    currentRoundNumber !== lastSeenRound
                ) {
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(
                            LAST_ROUND_KEY,
                            String(currentRoundNumber),
                        );
                    }
                    if (pathname !== '/voting') {
                        router.push('/voting');
                    }
                    return;
                }

                // 3) New revealed round → send to reveal page once
                if (
                    lastRevealedRound !== null &&
                    lastRevealedRound !== lastSeenRevealedRound
                ) {
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(
                            LAST_REVEALED_ROUND_KEY,
                            String(lastRevealedRound),
                        );
                    }
                    if (pathname !== '/voting/reveal') {
                        router.push('/voting/reveal');
                    }
                }
            } catch (error) {
                console.error('Unexpected error in PhaseWatcher', error);
            }
        };

        // Initial load and then poll every 10s
        void load();
        const intervalId = window.setInterval(() => {
            void load();
        }, 10000);

        return () => {
            isMounted = false;
            window.clearInterval(intervalId);
        };
    }, [pathname, router, supabase]);

    return null;
}

export default PhaseWatcher;
