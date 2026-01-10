// src/app/api/auth/send-verification-code/route.ts
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { writeClient } from '@/lib/sanity'; // Use writeClient to patch the document
import { groq } from 'next-sanity';
import crypto from 'crypto';
import { getMaxListeners } from 'events';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!email) {
            return NextResponse.json({ message: 'Email is required' }, { status: 400 });
        }

        // Find the user in Sanity by email
        const user = await writeClient.fetch(groq`*[_type == "AppUser" && email == $email][0]`, { email });
        if (!user) {
            return NextResponse.json({ message: 'User not found' }, { status: 404 });
        }

        // Generate a 6-digit verification code
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        // Set the expiration for the code (e.g., 15 minutes)
        const expirationTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // Patch the user document with the new code and expiration
        await writeClient
            .patch(user._id)
            .set({
                'temp.verificationCode': verificationCode,
                'temp.codeExpiresAt': expirationTime,
            })
            .commit();

        // Send the email using Resend
        await resend.emails.send({
            from: 'onboarding@resend.dev', // Replace with your verified Resend domain
            to: "godlinessdongorere@gmail.com",
            subject: 'Caterflow Password Reset',
            html: `<p>Your password reset code is: <strong>${verificationCode}</strong>. This code is valid for 15 minutes.</p>`,
        });

        return NextResponse.json({ message: 'Verification code sent successfully' }, { status: 200 });
    } catch (error) {
        console.error('Error sending verification code:', error);
        return NextResponse.json({ message: 'Failed to send verification code' }, { status: 500 });
    }
}