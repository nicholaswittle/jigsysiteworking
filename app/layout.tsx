import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jigsy's Ordering Demo",
  description:
    "A private concept demo for customer pickup ordering and staff order management.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
