import type { Metadata } from "next";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import { ThemeProvider } from "@/components/site/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

// Interface and display face: a crisp grotesk with firm figures.
const sans = Schibsted_Grotesk({
  variable: "--font-face-sans",
  subsets: ["latin"],
});

// Metrics and code: dotted zero and tabular digits keep numbers easy to scan.
const mono = JetBrains_Mono({
  variable: "--font-face-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Pasta: compare AI models side by side",
  description:
    "Send one prompt to GPT, Claude, Gemini, DeepSeek, Groq and Qwen at once. Compare answers, latency and cost with your own API keys.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes sets the theme class before paint, so the server markup differs on purpose.
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable} min-h-dvh font-sans antialiased`}>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            <Header />
            {children}
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
