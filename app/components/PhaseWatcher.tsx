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
const LAST_KITCHEN_SIGNAL_KEY = 'tg:lastSeenKitchenSignalVersion';
const LAST_MINIGAME_SIGNAL_KEY = 'tg:lastSeenMinigameSignalVersion';

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
                            'id, status, cur_round_number, roles_revealed, last_revealed_round, kitchen_signal_version, minigame_signal_version',
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
                const kitchenSignalVersion: number | null =
                    (activeGame as { kitchen_signal_version?: number | null })
                        .kitchen_signal_version ?? null;
                const minigameSignalVersion: number | null =
                    (activeGame as { minigame_signal_version?: number | null })
                        .minigame_signal_version ?? null;

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
                const storedKitchenSignalVersion =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(LAST_KITCHEN_SIGNAL_KEY)
                        : null;
                const storedMinigameSignalVersion =
                    typeof window !== 'undefined'
                        ? window.localStorage.getItem(LAST_MINIGAME_SIGNAL_KEY)
                        : null;

                const lastSeenRound = storedRound
                    ? Number.parseInt(storedRound, 10)
                    : null;
                const lastSeenRevealedRound = storedRevealedRound
                    ? Number.parseInt(storedRevealedRound, 10)
                    : null;
                const lastSeenRolesRevealed = storedRolesRevealed === 'true';
                const lastSeenKitchenSignal = storedKitchenSignalVersion
                    ? Number.parseInt(storedKitchenSignalVersion, 10)
                    : null;
                const lastSeenMinigameSignal = storedMinigameSignalVersion
                    ? Number.parseInt(storedMinigameSignalVersion, 10)
                    : null;

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

                // 2) New active round number  send to voting once
                //    but avoid hijacking first-time logins: if we have never
                //    stored a round number before, treat the current value as
                //    the baseline and do not redirect.
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
                    if (lastSeenRound !== null && pathname !== '/voting') {
                        router.push('/voting');
                    }
                    return;
                }

                // 3) New revealed round  send to reveal page once
                //    same first-login behavior: only redirect if we've seen a
                //    revealed round before in this browser.
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
                    if (
                        lastSeenRevealedRound !== null &&
                        pathname !== '/voting/reveal'
                    ) {
                        router.push('/voting/reveal');
                    }
                    return;
                }

                // 4) New minigame signal version  send to minigame screen once
                //    but again, only after we have a stored baseline.
                if (
                    minigameSignalVersion !== null &&
                    minigameSignalVersion !== lastSeenMinigameSignal
                ) {
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(
                            LAST_MINIGAME_SIGNAL_KEY,
                            String(minigameSignalVersion),
                        );
                    }
                    if (
                        lastSeenMinigameSignal !== null &&
                        pathname !== '/minigame'
                    ) {
                        router.push('/minigame');
                    }
                    return;
                }

                // 5) New kitchen signal version  send to kitchen screen once
                //    but DO NOT hijack first-time logins: if there's no stored
                //    kitchen signal yet, just record the current value and keep
                //    them on whatever page (e.g. /profile) they navigated to.
                if (
                    kitchenSignalVersion !== null &&
                    kitchenSignalVersion !== lastSeenKitchenSignal
                ) {
                    if (typeof window !== 'undefined') {
                        window.localStorage.setItem(
                            LAST_KITCHEN_SIGNAL_KEY,
                            String(kitchenSignalVersion),
                        );
                    }

                    if (
                        lastSeenKitchenSignal !== null &&
                        pathname !== '/kitchen'
                    ) {
                        router.push('/kitchen');
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
