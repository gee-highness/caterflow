// src/app/api/approvals/route.ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { getUserSiteInfo } from '@/lib/siteFiltering';

// Purchase orders pending approval - simplified filter
const purchaseOrderApprovalQuery = (siteFilter: string) => groq`
  *[_type == "PurchaseOrder" && status == "pending-approval" ${siteFilter}] {
    _id,
    _type,
    _createdAt,
    "createdAt": _createdAt,
    "title": "Approve Purchase Order",
    "description": "Purchase order for items",
    "priority": "high",
    "site": site->{name, _id},
    "poNumber": poNumber,
    "orderedByName": orderedBy->name,
    orderedItems[]{
        _key,
        orderedQuantity,
        unitPrice,
        "stockItem": stockItem->{name},
        "supplier": supplier->{name}
    }
  }
`;

// Internal transfers pending approval - simplified filter
const internalTransferApprovalQuery = (siteFilter: string) => groq`
  *[_type == "InternalTransfer" && status == "pending-approval" ${siteFilter}] {
    _id,
    _type,
    _createdAt,
    "createdAt": _createdAt,
    "title": "Approve Internal Transfer",
    "description": "Transfer request from " + coalesce(fromBin->site->name, "Unknown") + " to " + coalesce(toBin->site->name, "Unknown"),
    "priority": "high",
    "fromSite": fromBin->site->{name, _id},
    "toSite": toBin->site->{name, _id},
    transferNumber
  }
`;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const userSite = searchParams.get('userSite');
        const userRole = searchParams.get('userRole');

        console.log('Approvals API called with:', { userRole, userSite });

        // If userSite is provided directly, use it (for site managers)
        let siteFilter = '';

        if (userRole === 'siteManager' && userSite) {
            console.log('Building site filter for site manager with site:', userSite);

            // For purchase orders: only show POs from their site
            siteFilter = `&& site._ref == "${userSite}"`;

            // For transfers: show transfers FROM their site (since they approve outgoing transfers)
            // This is handled in the client-side filter below
        } else if (userRole === 'admin' || userRole === 'auditor' || userRole === 'procurer') {
            // Admins, auditors, and procurers can see everything
            siteFilter = '';
        } else {
            // No permission
            return NextResponse.json([]);
        }

        console.log('Site filter being used:', siteFilter);

        // Fetch both types of approvals
        const [purchaseOrders, internalTransfers] = await Promise.all([
            client.fetch(purchaseOrderApprovalQuery(siteFilter)),
            client.fetch(internalTransferApprovalQuery('')), // Transfers filtered client-side
        ]);

        let approvals = [...purchaseOrders, ...internalTransfers];

        console.log('Raw approvals fetched:', {
            purchaseOrders: purchaseOrders.length,
            internalTransfers: internalTransfers.length,
            total: approvals.length
        });

        // Normalize items
        approvals = approvals.map((approval: any) => {
            if (approval._type === 'PurchaseOrder') {
                const supplierNames = [...new Set((approval.orderedItems || []).map((i: any) => i.supplier?.name).filter(Boolean))];
                return {
                    ...approval,
                    siteName: approval.site?.name || 'Unknown Site',
                    description: supplierNames.length > 0
                        ? `Purchase order from ${supplierNames.join(', ')}`
                        : (approval.description || 'Purchase order'),
                    supplierNames: supplierNames.join(', ')
                };
            } else if (approval._type === 'InternalTransfer') {
                return {
                    ...approval,
                    siteName: approval.fromSite?.name || 'Unknown Site',
                };
            }
            return approval;
        });

        // Additional client-side filtering for site managers
        if (userRole === 'siteManager' && userSite) {
            approvals = approvals.filter((approval: any) => {
                if (approval._type === 'PurchaseOrder') {
                    return approval.site?._id === userSite;
                }
                if (approval._type === 'InternalTransfer') {
                    // Site managers approve transfers FROM their site
                    return approval.fromSite?._id === userSite;
                }
                return false;
            });

            console.log('After site manager filtering:', approvals.length, 'approvals');
        }

        // Sort by creation date, newest first
        approvals.sort((a: any, b: any) => new Date(b._createdAt).getTime() - new Date(a._createdAt).getTime());

        console.log('Final approvals to return:', approvals.length);

        return NextResponse.json(approvals);
    } catch (error: any) {
        console.error('Failed to fetch pending approvals:', error);
        return NextResponse.json({ error: 'Failed to fetch pending approvals', details: error.message }, { status: 500 });
    }
}