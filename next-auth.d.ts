import NextAuth, { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';

// Tell TypeScript what our custom Session will look like
declare module 'next-auth' {
    interface Session {
        user: {
            accessToken?: string;
            refreshToken?: string;
            username?: string;
        } & DefaultSession['user']; // Merge with default properties
    }
}

// Tell TypeScript what our custom JWT will look like
declare module 'next-auth/jwt' {
    interface JWT {
        accessToken?: string;
        refreshToken?: string;
        username?: string;
        accessTokenExpires?: number;
    }
}