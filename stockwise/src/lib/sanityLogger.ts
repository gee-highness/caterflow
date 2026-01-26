// src/lib/sanityLogger.ts
import { writeClient } from './sanity'; // Import writeClient instead of client
import { logger as appLogger } from './logger'; // Import our existing application logger

interface SanityLogDetails {
  payload?: any;
  oldValue?: any;
  newValue?: any;
  query?: string;
  errorDetails?: any;
  durationMs?: number;
  resultCount?: number;
  createAccountIntent?: boolean;
}

export async function logSanityInteraction(
  operationType: string,
  message: string,
  documentType?: string,
  documentId?: string,
  userId?: string,
  success: boolean = true,
  details?: SanityLogDetails
) {
  try {
    const logDocument = {
      _type: 'sanityLog',
      timestamp: new Date().toISOString(),
      operationType,
      message,
      documentType: documentType || 'N/A',
      documentId: documentId || 'N/A',
      userId: userId || 'anonymous',
      success,
      details: details || {},
    };

    // Use writeClient directly instead of client.withConfig()
    await writeClient.create(logDocument);
    appLogger.info(`SanityLogger: Logged interaction: ${operationType} - ${message}`);
  } catch (error: any) {
    appLogger.error('SanityLogger: Failed to log interaction to Sanity:', {
      operationType,
      message,
      documentType,
      documentId,
      userId,
      success,
      details,
      loggingError: error.message,
    });
  }
}