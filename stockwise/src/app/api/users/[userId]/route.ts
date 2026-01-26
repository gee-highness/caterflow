// pages/api/app-users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ userId: string }> } // Change params to be a Promise
) {
    try {
        const { userId } = await params; // Await the params promise

        // Validate that a user ID was provided
        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Sanity query to fetch a single user by ID, including the associated site details
        const query = groq`*[_type == "AppUser" && _id == $userId][0] {
      _id,
      name,
      email,
      role,
      isActive,
      "assignedSite": associatedSite->{_id, name}
    }`;

        const user = await writeClient.fetch(query, { userId });

        // Handle case where user is not found
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        return NextResponse.json(user);
    } catch (error) {
        console.error('Error fetching user data:', error);
        return NextResponse.json(
            { error: 'Failed to fetch user data' },
            { status: 500 }
        );
    }
}