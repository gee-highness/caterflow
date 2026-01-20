// lib/siteFiltering.ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export interface UserSiteInfo {
  userId: string;
  userRole: string;
  userSiteId: string | null;
  canAccessMultipleSites: boolean;
}

export async function getUserSiteInfo(request?: Request): Promise<UserSiteInfo> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error('User not authenticated');
  }

  const userRole = session.user.role;
  const userSiteId = session.user.associatedSite?._id || null;

  // Users who can see multiple sites: admin, auditor, procurer
  const canAccessMultipleSites = ['admin', 'auditor', 'procurer'].includes(userRole);

  console.log('🔐 User session info:', {
    userId: session.user.id,
    userRole,
    userSiteId,
    canAccessMultipleSites
  });

  return {
    userId: session.user.id,
    userRole,
    userSiteId,
    canAccessMultipleSites
  };
}

export function buildSiteFilter(userSiteInfo: UserSiteInfo, fieldPath: string = 'site._ref'): string {
  if (userSiteInfo.canAccessMultipleSites) {
    console.log('🌐 Multi-site user - no filter applied');
    return ''; // No filter for multi-site users
  }

  if (userSiteInfo.userSiteId) {
    const filter = `&& ${fieldPath} == "${userSiteInfo.userSiteId}"`;
    console.log('📍 Single-site user filter:', filter);
    return filter;
  }

  // If user has no site association and can't access multiple sites, return no results
  console.log('🚫 No site access - returning false filter');
  return '&& false';
}

export function buildBinSiteFilter(userSiteInfo: UserSiteInfo): string {
  // For bin counts, we filter by the bin's site reference
  // The path in InventoryCount is: bin->site._ref
  return buildSiteFilter(userSiteInfo, 'bin->site._ref');
}

export function buildTransactionSiteFilter(userSiteInfo: UserSiteInfo): string {
  if (userSiteInfo.canAccessMultipleSites) {
    return '';
  }

  if (userSiteInfo.userSiteId) {
    const siteId = userSiteInfo.userSiteId;
    return `&& (
      // Check any bin reference at document level
      receivingBin->site._ref == "${siteId}" ||
      fromBin->site._ref == "${siteId}" ||
      toBin->site._ref == "${siteId}" ||
      sourceBin->site._ref == "${siteId}" ||
      sourceSite._ref == "${siteId}" ||
      bin->site._ref == "${siteId}" ||
      
      // Check item-level bins in goods receipts
      count(receivedItems[receivingBin->site._ref == "${siteId}"]) > 0 ||
      
      // Check purchase order site
      purchaseOrder->site._ref == "${siteId}"
    )`;
  }

  return '&& false';
}