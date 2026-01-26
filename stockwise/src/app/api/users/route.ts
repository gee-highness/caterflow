import { NextRequest, NextResponse } from 'next/server';
import { writeClient } from '@/lib/sanity';
import { groq } from 'next-sanity';
import bcrypt from 'bcryptjs';
import { logSanityInteraction } from '@/lib/sanityLogger';

interface UserData {
  _id?: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  isActive: boolean;
  associatedSite?: string;
}

// GET all users
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');

    let query;
    let params = {};

    if (role) {
      query = groq`*[_type == "AppUser" && role == $role] | order(name asc) {
        _id,
        name,
        email,
        role,
        isActive,
        associatedSite->{_id, name}
      }`;
      params = { role };
    } else {
      query = groq`*[_type == "AppUser"] | order(name asc) {
        _id,
        name,
        email,
        role,
        isActive,
        associatedSite->{_id, name}
      }`;
    }

    const users = await writeClient.fetch(query, params);
    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// CREATE a new user
export async function POST(req: NextRequest) {
  try {
    const userData: UserData = await req.json();

    // Validate required fields
    if (!userData.name || !userData.email || !userData.role) {
      return NextResponse.json(
        { error: 'Name, email, and role are required' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await writeClient.fetch(
      groq`*[_type == "AppUser" && email == $email][0]`,
      { email: userData.email }
    );

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Create user document
    const newUser = {
      _type: 'AppUser',
      name: userData.name,
      email: userData.email,
      role: userData.role,
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      associatedSite: userData.associatedSite ? {
        _type: 'reference',
        _ref: userData.associatedSite
      } : undefined,
      requiresPasswordSetup: true
    };

    const result = await writeClient.create(newUser);

    // Log the action
    await logSanityInteraction(
      'user_management',
      'User created',
      'AppUser',
      result._id,
      userData.email,
      true
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

// UPDATE a user
export async function PATCH(req: NextRequest) {
  try {
    const userData: UserData = await req.json();

    if (!userData._id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await writeClient.fetch(
      groq`*[_type == "AppUser" && _id == $id][0]`,
      { id: userData._id }
    );

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if email is already used by another user
    if (userData.email && userData.email !== existingUser.email) {
      const userWithEmail = await writeClient.fetch(
        groq`*[_type == "AppUser" && email == $email && _id != $id][0]`,
        { email: userData.email, id: userData._id }
      );

      if (userWithEmail) {
        return NextResponse.json(
          { error: 'Email already in use by another user' },
          { status: 409 }
        );
      }
    }

    // Prepare update data
    const updateData: any = {
      name: userData.name,
      email: userData.email,
      role: userData.role,
      isActive: userData.isActive
    };

    // Hash password if provided
    if (userData.password) {
      updateData.password = await bcrypt.hash(userData.password, 10);
    }

    // Handle site reference
    if (userData.associatedSite) {
      updateData.associatedSite = {
        _type: 'reference',
        _ref: userData.associatedSite
      };
    } else if (userData.associatedSite === null) {
      updateData.associatedSite = null;
    }

    // Update user
    const result = await writeClient
      .patch(userData._id)
      .set(updateData)
      .commit();

    // Log the action
    await logSanityInteraction(
      'user_management',
      'User updated',
      'AppUser',
      userData._id,
      userData.email,
      true
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE a user
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await writeClient.fetch(
      groq`*[_type == "AppUser" && _id == $id][0]`,
      { id }
    );

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete user
    await writeClient.delete(id);

    // Log the action
    await logSanityInteraction(
      'user_management',
      'User deleted',
      'AppUser',
      id,
      existingUser.email,
      true
    );

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}