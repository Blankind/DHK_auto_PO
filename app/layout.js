import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const font = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata = { title: "Dehikas Purchase Import", robots: { index: false, follow: false } };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className={font.className}>{children}</body>
    </html>
  );
}
