'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';

const LoginPage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [username, setUsername] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async (
        usernameValue: string,
        passwordValue: string,
    ) => {
        try {
            const {
                error,
                data: { user },
            } = await supabase.auth.signInWithPassword({
                email: usernameValue,
                password: passwordValue,
            });

            if (error) {
                alert('Error with auth: ' + error.message);
            } else if (!user) {
                alert('Login failed: no user returned.');
            } else {
                router.push('/profile');
            }
        } catch (error) {
            console.error('error', error);
            alert(
                (error as unknown as { error_description?: string })
                    .error_description || String(error),
            );
        }
    };

    const handleSignup = async () => {
        if (!fullName || !username || !password) {
            alert('Please enter your name, email, and password first.');
            return;
        }

        try {
            const {
                error,
                data: { user },
            } = await supabase.auth.signUp({
                email: username,
                password,
            });

            if (error) {
                alert('Error with signup: ' + error.message);
                return;
            }

            if (!user) {
                alert(
                    'Signup successful, but no user session was returned. Please check your email for confirmation and then try again.',
                );
                return;
            }

            // Ensure there is a single active game to join
            const { data: activeGame, error: activeGameError } = await supabase
                .from('games')
                .select('id, status')
                .eq('status', 'active')
                .maybeSingle();

            if (activeGameError) {
                console.error('Error loading active game', activeGameError);
            }

            if (!activeGame) {
                alert(
                    'No active game is currently configured. Please ask the host to start a game before signing up.',
                );
                return;
            }

            // Save the player name into auth metadata (optional)
            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    full_name: fullName,
                },
            });

            if (updateError) {
                console.error('Error saving profile metadata', updateError);
            }

            // Create the player row for this game; headshots are no longer used
            const { error: playersError } = await supabase
                .from('players')
                .upsert({
                    id: user.id,
                    game_id: activeGame.id,
                    full_name: fullName,
                    headshot_url: '',
                    eliminated: false,
                });

            if (playersError) {
                console.error('Error saving player record', playersError);
                alert('Error saving player record: ' + playersError.message);
                return;
            }

            router.push('/profile');
        } catch (error) {
            console.error('error', error);
            alert(
                (error as unknown as { error_description?: string })
                    .error_description || String(error),
            );
        }
    };

    return (
        <div className='flex min-h-screen items-center justify-center bg-(--tg-bg) px-4 py-8'>
            <div className='w-full max-w-md'>
                <div className='rounded-2xl border border-[rgba(0,0,0,0.6)] bg-[radial-gradient(circle_at_10%_0%,#24140a_0,#1f1414_40%,#120b0b_100%)] p-px shadow-[0_18px_35px_rgba(0,0,0,0.8)]'>
                    <div className='rounded-2xl bg-(--tg-surface) px-8 py-8 shadow-[inset_0_0_18px_rgba(0,0,0,0.9)]'>
                        <h1 className='mb-2 text-center text-xs font-semibold tracking-[0.4em] text-(--tg-gold-soft)'>
                            THE TRAITORS
                        </h1>

                        <h2 className='mb-6 text-center text-2xl font-semibold text-(--tg-text)'>
                            Enter the manor
                        </h2>

                        <form
                            className='space-y-6'
                            onSubmit={(e) => {
                                e.preventDefault();
                                void handleLogin(username, password);
                            }}
                        >
                            <div>
                                <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                    Your name
                                </label>
                                <input
                                    type='text'
                                    className='w-full rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                    placeholder='Full name for the game'
                                    value={fullName}
                                    onChange={(e) =>
                                        setFullName(e.target.value)
                                    }
                                    required
                                />
                            </div>

                            <div>
                                <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                    Email
                                </label>
                                <input
                                    type='email'
                                    className='w-full rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                    placeholder='you@example.com'
                                    value={username}
                                    onChange={(e) =>
                                        setUsername(e.target.value)
                                    }
                                    required
                                />
                            </div>

                            <div>
                                <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                    Password
                                </label>

                                <input
                                    type='password'
                                    className='w-full rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                    placeholder='Your password'
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    required
                                />
                            </div>

                            <div className='mt-6 flex flex-col gap-2'>
                                <button
                                    type='submit'
                                    className='inline-flex w-full items-center justify-center rounded-full bg-(--tg-gold) px-4 py-2 text-sm font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft)'
                                >
                                    Log in
                                </button>

                                <button
                                    type='button'
                                    onClick={() => {
                                        void handleSignup();
                                    }}
                                    className='inline-flex w-full items-center justify-center rounded-full border border-(--tg-gold) px-4 py-2 text-sm font-semibold text-(--tg-gold-soft) transition hover:bg-[rgba(0,0,0,0.4)] active:translate-y-px active:scale-[0.98]'
                                >
                                    Sign up
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
