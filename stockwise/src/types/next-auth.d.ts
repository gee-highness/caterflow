import NextAuth from 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
            role: string;
            associatedSite?: {
                _id: string;
                name: string;
            };
        };
    }

    interface User {
        id: string;
        name?: string | null;
        email?: string | null;
        role: string;
        associatedSite?: {
            _id: string;
            name: string;
        };
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        role: string;
        associatedSite?: {
            _id: string;
            name: string;
        };
    }
}