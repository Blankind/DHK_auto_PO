import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = { title: "Dehikas Purchasing", robots: { index: false, follow: false } };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
