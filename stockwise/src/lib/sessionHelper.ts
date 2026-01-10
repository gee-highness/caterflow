// lib/sessionHelper.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest } from 'next/server';

export async function getSessionFromRequest(request: NextRequest) {
    // For API routes, we need to manually handle the session
    // This is a simplified approach - you might need to adjust based on your setup
    try {
        const session = await getServerSession(authOptions);
        return session;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}