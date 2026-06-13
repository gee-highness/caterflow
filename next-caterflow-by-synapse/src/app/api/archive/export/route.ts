import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getArchiveDb, COLLECTIONS } from '@/lib/mongoClient';

export const maxDuration = 300; // Allow up to 5 minutes for large exports

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        
        // Ensure only admins can download the backup
        if (!session?.user || session.user.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 401 });
        }

        const db = await getArchiveDb();
        const exportData: Record<string, any[]> = {};

        // Fetch all data from all archive collections
        for (const collectionName of Object.values(COLLECTIONS)) {
            const data = await db.collection(collectionName).find({}).toArray();
            exportData[collectionName] = data;
        }

        // Add metadata
        const finalExport = {
            metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: session.user.email,
                collectionsCount: Object.keys(exportData).length,
            },
            data: exportData
        };

        const jsonString = JSON.stringify(finalExport, null, 2);

        // Return as a downloadable JSON file
        return new NextResponse(jsonString, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="caterflow_archive_backup_${new Date().toISOString().split('T')[0]}.json"`,
            },
        });
    } catch (error: any) {
        console.error('Archive export failed:', error);
        return NextResponse.json(
            { error: 'Failed to generate archive backup', details: error?.message },
            { status: 500 }
        );
    }
}
