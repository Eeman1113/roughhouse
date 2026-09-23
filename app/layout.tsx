import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "roughhouse — floor plan editor",
  description: "Draw top-down architecture plans: walls, doors, windows, stairs and furniture.",
  icons: {
    icon: [
      { url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon-light.png`, media: "(prefers-color-scheme: light)", type: "image/png" },
      { url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon-dark.png`, media: "(prefers-color-scheme: dark)", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
