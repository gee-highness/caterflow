// src/app/api/auth/change-password/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { client, writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import bcrypt from 'bcryptjs';

// Helper function to decode the custom base64 token
const decodeAuthToken = (token: string) => {
    try {
        const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
        const json = Buffer.from(base64, 'base64').toString('utf-8');
        return JSON.parse(json);
    } catch (error) {
        console.error('Failed to decode token:', error);
        return null;
    }
};

export async function POST(req: NextRequest) {
    try {
        const { oldPassword, newPassword } = await req.json();

        // 1. Get the auth token from the cookie
        const cookieStore = cookies();
        const token = (await cookieStore).get('auth_token')?.value;

        if (!token) {
            return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
        }

        // 2. Decode the token to get the user ID
        const decodedToken = decodeAuthToken(token);
        if (!decodedToken || !decodedToken.userId) {
            return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
        }
        const userId = decodedToken.userId;

        // 3. Fetch the user's current password from Sanity
        const user = await client.fetch(
            groq`*[_type == "AppUser" && _id == $userId][0]{_id, password}`,
            { userId }
        );

        if (!user) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        // 4. Compare the old password with the stored hash
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return NextResponse.json({ message: 'Incorrect current password' }, { status: 401 });
        }

        // 5. Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // 6. Update the user's password in Sanity
        await writeClient
            .patch(user._id)
            .set({ password: hashedPassword })
            .commit();

        return NextResponse.json({ message: 'Password changed successfully' }, { status: 200 });
    } catch (error) {
        console.error('Error changing password:', error);
        return NextResponse.json({ message: 'An unexpected error occurred' }, { status: 500 });
    }
}