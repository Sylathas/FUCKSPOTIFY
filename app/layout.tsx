import "./globals.css";        // tailwind styles if you use them
import Providers from "./providers";

export const metadata = {
  title: "Spotify Transfer",
  description: "Winamp style Spotify library viewer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-green-400">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}