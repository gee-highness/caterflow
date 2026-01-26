'use client';

import { ChakraProvider } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import themes from './theme/theme';
import { LoadingProvider } from '@/context/LoadingContext';
import { SidebarProvider } from '@/context/SidebarContext';
import { SessionProvider } from 'next-auth/react'; // Import the new provider

const ThemeProvider = dynamic(
  () => import('next-themes').then((mod) => mod.ThemeProvider),
  { ssr: false }
);

interface ProvidersProps {
  children?: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    // SessionProvider must wrap the entire application
    <SessionProvider>
      <ChakraProvider theme={themes}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <LoadingProvider>
            <SidebarProvider>
              {children}
            </SidebarProvider>
          </LoadingProvider>
        </ThemeProvider>
      </ChakraProvider>
    </SessionProvider>
  );
}