import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { groq } from 'next-sanity';
import { client, writeClient } from '@/lib/sanity';
import { compare, hash } from 'bcryptjs';

const userQuery = groq`*[_type == "AppUser" && email == $email][0] {
    _id,
    _rev,
    email,
    name,
    role,
    password,
    isActive,
    associatedSite->{_id, name}
}`;

export const authOptions: NextAuthOptions = {
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60,
    },
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) {
                    console.log('Missing credentials');
                    return null;
                }

                try {
                    const user = await client.fetch(userQuery, { email: credentials.email });

                    if (!user) {
                        console.log('User not found for email:', credentials.email);
                        return null;
                    }

                    // Check if user is active
                    if (user.isActive === false) {
                        console.log('User account is inactive:', user.email);
                        throw new Error('Account is inactive. Please contact administrator.');
                    }

                    // Handle new users without password
                    if (!user.password) {
                        console.log('New user - setting password for:', user.email);

                        // Hash and set the password
                        const hashedPassword = await hash(credentials.password, 10);

                        // Update user in Sanity with the new password
                        await writeClient
                            .patch(user._id)
                            .set({
                                password: hashedPassword,
                                // You might want to set other fields like lastLogin, etc.
                            })
                            .commit();

                        console.log('Password set successfully for new user:', user.email);

                        return {
                            id: user._id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            associatedSite: user.associatedSite || null,
                        };
                    }

                    // Existing users - verify password
                    const isValidPassword = await compare(credentials.password, user.password);

                    if (!isValidPassword) {
                        console.log('Invalid password for user:', user.email);
                        return null;
                    }

                    console.log('Login successful for user:', user.email);

                    return {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        associatedSite: user.associatedSite || null,
                    };
                } catch (error) {
                    console.error('Authorization error:', error);

                    // Handle specific error cases
                    if (error instanceof Error) {
                        if (error.message.includes('inactive')) {
                            throw new Error('Account is inactive. Please contact administrator.');
                        }
                        // Re-throw the original error if it's already an Error instance
                        throw error;
                    }

                    // For unknown error types, throw a generic error
                    throw new Error('Authentication failed. Please try again.');
                }
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.role = user.role;
                token.associatedSite = user.associatedSite;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.id as string;
                session.user.role = token.role as string;
                session.user.associatedSite = token.associatedSite as any;
            }
            return session;
        },
    },
    pages: {
        signIn: '/login',
    },
    debug: process.env.NODE_ENV === 'development',
};