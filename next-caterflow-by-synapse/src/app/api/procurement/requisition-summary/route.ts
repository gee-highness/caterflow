// src/app/api/procurement/requisition-summary/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { unstable_noStore as noStore } from 'next/cache';
import { client } from '@/lib/sanity';
import { groq } from 'next-sanity';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserSiteInfo, buildSiteFilter } from '@/lib/siteFiltering';

/**
 * Helper to set no-cache headers on a NextResponse
 */
function setNoCache(res: NextResponse) {
	res.headers.set(
		'Cache-Control',
		'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
	);
	res.headers.set('Pragma', 'no-cache');
	res.headers.set('Expires', '0');
	return res;
}

/**
 * GET handler to fetch requisition summary data
 */
export async function GET(request: Request) {
	try {
		// Instruct Next to avoid caching for this route
		try {
			noStore();
		} catch (e) {
			console.warn('noStore() failed (non-fatal). Continuing.');
		}

		const { searchParams } = new URL(request.url);
		const startDate = searchParams.get('startDate');
		const endDate = searchParams.get('endDate');
		const siteId = searchParams.get('siteId');
		const status = searchParams.get('status') || 'approved';

		// Get user site info for filtering
		const userSiteInfo = await getUserSiteInfo(request);
		const siteFilter = buildSiteFilter(userSiteInfo, 'site._ref');

		// Build the base query
		let baseQuery = `*[_type == "PurchaseOrder" ${siteFilter} && status == $status`;
		const queryParams: any = { status };

		// Add date range filter if provided
		if (startDate && endDate) {
			baseQuery += ` && orderDate >= $startDate && orderDate <= $endDate`;
			queryParams.startDate = startDate;
			queryParams.endDate = endDate;
		}

		// Add site filter if provided
		if (siteId && siteId !== 'all') {
			baseQuery += ` && site._ref == $siteId`;
			queryParams.siteId = siteId;
		}

		// Complete query with ordering and projection
		const query = groq`
      ${baseQuery}] | order(orderDate desc) {
        _id,
        poNumber,
        orderDate,
        status,
        site->{
          _id,
          name
        },
        orderedItems[] {
          _key,
          orderedQuantity,
          unitPrice,
          stockItem->{
            _id,
            name,
            sku,
            unitOfMeasure
          },
          supplier->{
            _id,
            name
          }
        },
        totalAmount,
        _createdAt
      }
    `;

		const purchaseOrders = await client.fetch(query, queryParams);

		// Process purchase orders to create requisition summary
		const summary = await processRequisitionSummary(purchaseOrders, userSiteInfo);

		const res = NextResponse.json(summary);
		return setNoCache(res);

	} catch (error: any) {
		console.error('Error fetching requisition summary:', error);
		const res = NextResponse.json(
			{ error: 'Failed to fetch requisition summary', details: error?.message || String(error) },
			{ status: 500 }
		);
		return setNoCache(res);
	}
}

/**
 * Process purchase orders into requisition summary format
 */
async function processRequisitionSummary(purchaseOrders: any[], userSiteInfo: any) {
	const items: any[] = [];
	let totalAmount = 0;
	const sites = new Map<string, { _id: string; name: string }>();
	const suppliers = new Map<string, { _id: string; name: string; code?: string }>();
	const categories = new Set<string>();

	// Fetch all suppliers with their codes
	const allSuppliers = await client.fetch(groq`
    *[_type == "Supplier"] {
      _id,
      name
    }
  `);

	allSuppliers.forEach((supplier: any) => {
		suppliers.set(supplier._id, supplier);
	});

	// Process each purchase order
	for (const po of purchaseOrders) {
		const siteId = po.site?._id;
		const siteName = po.site?.name || 'Unknown Site';

		// Add site to sites map
		if (siteId) {
			sites.set(siteId, { _id: siteId, name: siteName });
		}

		// Process each ordered item
		for (const item of po.orderedItems) {
			const supplierId = item.supplier?._id;
			const supplierName = item.supplier?.name || 'Unknown Supplier';
			const amount = (item.unitPrice || 0) * (item.orderedQuantity || 0);

			// Generate supplier code (based on first 3 letters of name)
			const supplierCode = generateSupplierCode(supplierName);

			// Determine category based on site name (matching your PDF format)
			const category = determineCategory(siteName);

			// Add item to summary
			items.push({
				siteId,
				siteName,
				supplierId,
				supplierName,
				supplierCode,
				amount,
				category,
				poNumber: po.poNumber,
				orderDate: po.orderDate,
				itemName: item.stockItem?.name,
				itemSku: item.stockItem?.sku,
				quantity: item.orderedQuantity,
				unitOfMeasure: item.stockItem?.unitOfMeasure,
				unitPrice: item.unitPrice
			});

			totalAmount += amount;
			categories.add(category);

			// Add supplier to suppliers map if not already there
			if (supplierId && !suppliers.has(supplierId)) {
				suppliers.set(supplierId, {
					_id: supplierId,
					name: supplierName,
					code: supplierCode
				});
			}
		}
	}

	// Group items by site for easier display
	const itemsBySite = Array.from(sites.values()).map(site => {
		const siteItems = items.filter(item => item.siteId === site._id);
		const siteTotal = siteItems.reduce((sum, item) => sum + item.amount, 0);

		return {
			site,
			items: siteItems,
			totalAmount: siteTotal
		};
	});

	// Group items by category for the PDF format
	const itemsByCategory = Array.from(categories).map(category => {
		const categoryItems = items.filter(item => item.category === category);
		const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);

		return {
			category,
			items: categoryItems,
			totalAmount: categoryTotal
		};
	});

	return {
		items,
		itemsBySite,
		itemsByCategory,
		totalAmount,
		sites: Array.from(sites.values()),
		suppliers: Array.from(suppliers.values()),
		categories: Array.from(categories),
		purchaseOrdersCount: purchaseOrders.length,
		itemsCount: items.length
	};
}

/**
 * Generate supplier code based on name
 */
function generateSupplierCode(supplierName: string): string {
	if (!supplierName) return '';

	// Take first 3 letters, convert to uppercase, and pad if necessary
	const code = supplierName
		.replace(/[^A-Z]/gi, '')
		.toUpperCase()
		.substring(0, 3);

	return code || supplierName.substring(0, 3).toUpperCase();
}

/**
 * Determine category based on site name (matching your PDF structure)
 */
function determineCategory(siteName: string): string {
	const lowerName = siteName.toLowerCase();

	// Map based on your PDF structure
	if (lowerName.includes('catering') || lowerName.includes('unit')) {
		return 'CATERING / UNITS';
	} else if (lowerName.includes('beef') || lowerName.includes('meat')) {
		return 'BEEF SUPPLIER';
	} else if (lowerName.includes('vegetable') || lowerName.includes('produce')) {
		return 'VEGETABLES';
	} else if (lowerName.includes('sponsor') || lowerName.includes('league')) {
		return 'SPONSORSHIPS';
	} else if (lowerName.includes('cold') || lowerName.includes('storage')) {
		return 'COLD FOOD STORAGE';
	} else {
		return 'GENERAL SUPPLIES';
	}
}