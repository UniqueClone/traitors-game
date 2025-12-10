'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/utils/supabase/client';

const NewPlayerPage = () => {
    const [supabase] = useState(() => createClient());
    const router = useRouter();

    const [fullName, setFullName] = useState('');
    const [headshotFile, setHeadshotFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        void (async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!session) {
                // No active session, send back to login
                router.replace('/login');
            }
        })();
    }, [router, supabase]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!fullName || !headshotFile) {
            alert('Please provide your full name and upload a headshot image.');
            return;
        }

        setLoading(true);

        try {
            // Ensure we still have a session / current user
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                alert('You must be logged in to complete your profile.');
                router.replace('/login');
                return;
            }

            // Find the currently active game; players must belong to an active game
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
                    'No active game is currently configured. Please ask the host to start a game before completing your profile.',
                );
                return;
            }

            // Upload headshot to Supabase Storage
            const fileExt = headshotFile.name.split('.').pop() ?? 'jpg';
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `user-headshots/${fileName}`;

            const { data: uploadData, error: uploadError } =
                await supabase.storage
                    .from('user-headshots')
                    .upload(filePath, headshotFile);

            if (uploadError || !uploadData) {
                alert('Error uploading headshot: ' + uploadError?.message);
                return;
            }

            const { data: publicUrlData } = supabase.storage
                .from('user-headshots')
                .getPublicUrl(uploadData.path);
            const headshotUrl = publicUrlData.publicUrl;

            // Update the authenticated user's metadata
            const { error: updateError } = await supabase.auth.updateUser({
                data: {
                    full_name: fullName,
                    headshot_url: headshotUrl,
                },
            });

            if (updateError) {
                alert('Error saving profile: ' + updateError.message);
                return;
            }

            // Also upsert into players table for the wall
            const { error: playersError } = await supabase
                .from('players')
                .upsert({
                    id: user.id,
                    game_id: activeGame.id,
                    full_name: fullName,
                    headshot_url: headshotUrl,
                    eliminated: false,
                });

            if (playersError) {
                alert('Error saving player record: ' + playersError.message);
                return;
            }

            // Profile complete – send them to the player wall for now
            router.push('/player-wall');
        } catch (error) {
            console.error('error', error);
            alert(
                (error as unknown as { error_description?: string })
                    .error_description || String(error),
            );
        } finally {
            setLoading(false);
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
                        <h2 className='mb-1 text-center text-2xl font-semibold text-(--tg-text)'>
                            Complete your player
                        </h2>
                        <p className='mb-6 text-center text-sm text-(--tg-text-muted)'>
                            Choose your name and portrait for the manor wall.
                        </p>

                        <form className='space-y-6' onSubmit={handleSubmit}>
                            <div>
                                <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                    Full name
                                </label>
                                <input
                                    type='text'
                                    className='w-full rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                    placeholder='Full name'
                                    value={fullName}
                                    onChange={(event) =>
                                        setFullName(event.target.value)
                                    }
                                    required
                                />
                            </div>

                            <div>
                                <label className='mb-1 block text-sm font-medium text-(--tg-gold-soft)'>
                                    Headshot image
                                </label>
                                <input
                                    type='file'
                                    accept='image/*'
                                    className='w-full cursor-pointer rounded-md border border-[rgba(0,0,0,0.6)] bg-[rgba(0,0,0,0.4)] px-3 py-2 text-(--tg-text) shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition outline-none file:mr-3 file:rounded-md file:border-0 file:bg-(--tg-gold) file:px-3 file:py-1 file:text-xs file:font-semibold file:text-(--tg-bg) focus:border-(--tg-gold) focus:shadow-[0_0_0_1px_rgba(212,175,55,0.7)]'
                                    onChange={(event) => {
                                        const file =
                                            event.target.files?.[0] ?? null;
                                        setHeadshotFile(file);
                                    }}
                                    required
                                />
                                <p className='mt-1 text-xs text-(--tg-text-muted)'>
                                    Upload a clear portrait photo. This will
                                    appear on the player wall.
                                </p>
                            </div>

                            <button
                                type='submit'
                                disabled={loading}
                                className='inline-flex w-full items-center justify-center rounded-full bg-(--tg-gold) px-4 py-2 text-sm font-semibold text-(--tg-bg) shadow-md transition hover:bg-(--tg-gold-soft) active:translate-y-px active:scale-[0.98] active:bg-(--tg-red-soft) disabled:cursor-not-allowed disabled:opacity-60'
                            >
                                {loading ? 'Saving...' : 'Save player'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewPlayerPage;
