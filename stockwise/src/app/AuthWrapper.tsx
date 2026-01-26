// app/AuthWrapper.tsx
'use client'

import { Box, Spinner } from '@chakra-ui/react';
import { useSession } from 'next-auth/react'
import LoginPage from './login/page';
import { useEffect, useState } from 'react';

interface AuthWrapperProps {
    children: React.ReactNode;
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
    const { data: session, status } = useSession();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Prevent hydration issues
    if (!mounted) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
                <Spinner size="xl" />
            </Box>
        );
    }

    if (status === 'loading') {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
                <Spinner size="xl" />
            </Box>
        );
    }

    if (status !== 'authenticated' || !session) {
        return <LoginPage />;
    }

    return <>{children}</>;
}