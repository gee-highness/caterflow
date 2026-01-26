// src/app/api/auth/reset-password/route.ts
import { NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    try {
        const { email, verificationCode, newPassword } = await req.json();

        if (!email || !verificationCode || !newPassword) {
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        // Find the user in Sanity and check the verification code
        const user = await writeClient.fetch(
            groq`*[_type == "AppUser" && email == $email && temp.verificationCode == $verificationCode][0]`,
            { email, verificationCode }
        );

        if (!user) {
            return NextResponse.json({ message: 'Invalid email or verification code' }, { status: 401 });
        }

        // Check if the code has expired
        const codeExpiresAt = user.temp?.codeExpiresAt;
        if (!codeExpiresAt || new Date(codeExpiresAt) < new Date()) {
            return NextResponse.json({ message: 'Verification code has expired' }, { status: 401 });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password and clear the temp data
        await writeClient
            .patch(user._id)
            .set({ password: hashedPassword })
            .unset(['temp.verificationCode', 'temp.codeExpiresAt'])
            .commit();

        return NextResponse.json({ message: 'Password reset successfully' }, { status: 200 });
    } catch (error) {
        console.error('Error resetting password:', error);
        return NextResponse.json({ message: 'Failed to reset password' }, { status: 500 });
    }
}