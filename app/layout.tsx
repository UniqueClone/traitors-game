import type { Metadata } from 'next';
import './globals.css';
import localFont from 'next/font/local';

export const traitorsFont = localFont({
    src: '../public/fonts/vladb-yarocut-black.otf',
});

export const metadata: Metadata = {
    title: 'Traitors Game',
    description: 'Welcome to Traitors!',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en'>
            <head>
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1'
                />
            </head>
            <body className={traitorsFont.className}>{children}</body>
        </html>
    );
}
