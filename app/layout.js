import "./globals.css";

export const metadata = { title: "Dehikas Purchase Import", robots: { index: false, follow: false } };

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, Arial, sans-serif" }}>{children}</body>
    </html>
  );
}
