// src/app/api/archive/health/route.ts
import { NextResponse } from 'next/server';

// Simple health check – no auth required, just confirms the service is up.
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}
