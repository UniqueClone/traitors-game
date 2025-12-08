/**
 * Home page of the Traitors Game application.
 * This page has the login and landing content.
 */
export default function Home() {
    return (
        <main className='flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4'>
            <h1 className='text-4xl font-bold text-white'>
                Welcome to our Traitors Game!
            </h1>

            <p className='mt-4 text-lg text-white'>
                Please log in to continue.
            </p>

            {/* Add login form or buttons here */}
        </main>
    );
}
