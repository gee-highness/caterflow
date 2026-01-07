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
        unitOfMeasure,
        category->{
          _id,
          title,
          description
        }
      },
      supplier->{
        _id,
        name
      }
    },
    totalAmount,
    _createdAt,
	orderedBy->{ name }
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
      name,
      code,
      contactPerson,
      phoneNumber,
      email,
      address,
      terms
    }
  `);

	allSuppliers.forEach((supplier: any) => {
		suppliers.set(supplier._id, supplier);
	});

	// Fetch all categories from the database
	const allCategories = await client.fetch(groq`
    *[_type == "Category"] {
      _id,
      title,
      description,
      siteMatchPatterns
    } | order(title asc)
  `);

	// Create a mapping of site patterns to categories
	const sitePatternToCategory = new Map<string, string>();
	allCategories.forEach((category: any) => {
		if (category.siteMatchPatterns && Array.isArray(category.siteMatchPatterns)) {
			category.siteMatchPatterns.forEach((pattern: string) => {
				sitePatternToCategory.set(pattern.toLowerCase(), category.title);
			});
		}
	});

	/**
	 * Determine category based on site name using database categories
	 */
	function determineCategory(siteName: string): string {
		if (!siteName) return 'UNCATEGORIZED';

		const lowerName = siteName.toLowerCase();

		// First, try to match by exact patterns stored in categories
		for (const [pattern, categoryTitle] of sitePatternToCategory.entries()) {
			if (lowerName.includes(pattern)) {
				return categoryTitle;
			}
		}

		// Then, try to match category title in site name
		for (const category of allCategories) {
			if (lowerName.includes(category.title.toLowerCase())) {
				return category.title;
			}
		}

		// Check if category title is contained in site name (partial match)
		for (const category of allCategories) {
			const words = category.title.toLowerCase().split(/\s+/);
			for (const word of words) {
				if (word.length > 3 && lowerName.includes(word)) {
					return category.title;
				}
			}
		}

		// Return first category or default
		return allCategories.length > 0 ? allCategories[0].title : 'UNCATEGORIZED';
	}

	// Process each purchase order
	for (const po of purchaseOrders) {
		const siteId = po.site?._id;
		const siteName = po.site?.name || 'Unknown Site';

		// Add site to sites map
		if (siteId) {
			sites.set(siteId, { _id: siteId, name: siteName });
		}

		// Process each ordered item
		// Process each ordered item
		for (const item of po.orderedItems) {
			const supplierId = item.supplier?._id;
			const supplierName = item.supplier?.name || 'Unknown Supplier';

			// Get unit price from item or calculate from amount/quantity
			let unitPrice = item.unitPrice;
			if (!unitPrice && item.orderedQuantity > 0) {
				const amount = (item.unitPrice || 0) * (item.orderedQuantity || 0);
				unitPrice = amount / item.orderedQuantity;
			}

			const amount = (unitPrice || 0) * (item.orderedQuantity || 0);

			// Generate supplier code if not already present
			let supplierCode = '';
			if (supplierId) {
				// First, try to get supplier from the allSuppliers map
				let supplier = suppliers.get(supplierId);

				// If supplier not found in allSuppliers, create a basic entry
				if (!supplier) {
					supplier = {
						_id: supplierId,
						name: supplierName,
						code: generateSupplierCode(supplierName),
						contactPerson: 'N/A',
						phoneNumber: 'N/A',
						email: 'N/A',
						address: 'N/A',
						terms: 'N/A'
					};
					suppliers.set(supplierId, supplier);
				}
				supplierCode = supplier.code || generateSupplierCode(supplierName);
			} else {
				supplierCode = generateSupplierCode(supplierName);
			}

			// Determine category based on multiple factors (priority order):
			// 1. Stock item's assigned category (from database)
			// 2. Site-based category determination (using database categories)
			// 3. Default to first category or 'UNCATEGORIZED'
			let category = 'UNCATEGORIZED';

			if (item.stockItem?.category?.title) {
				// Use the stock item's actual assigned category from database
				category = item.stockItem.category.title;
			} else {
				// Determine category based on site name using database categories
				category = determineCategory(siteName);
			}

			// Get supplier contact info from database
			const supplier = suppliers.get(supplierId || '');
			const contactInfo = supplier ? {
				contactPerson: supplier.contactPerson || 'N/A',
				phoneNumber: supplier.phoneNumber || 'N/A',
				email: supplier.email || 'N/A',
				address: supplier.address || 'N/A',
				terms: supplier.terms || 'N/A'
			} : {
				contactPerson: 'N/A',
				phoneNumber: 'N/A',
				email: 'N/A',
				address: 'N/A',
				terms: 'N/A'
			};

			// Add item to summary
			items.push({
				siteId,
				siteName,
				siteAddress: po.site?.address || 'N/A',
				siteContact: po.site?.contactPerson || 'N/A',
				sitePhone: po.site?.phoneNumber || 'N/A',
				supplierId,
				supplierName,
				supplierContact: contactInfo.contactPerson,
				supplierPhone: contactInfo.phoneNumber,
				supplierEmail: contactInfo.email,
				supplierAddress: contactInfo.address,
				supplierTerms: contactInfo.terms,
				supplierCode,
				amount,
				category,
				subCategory: item.stockItem?.category?.description || category, // Use description as subcategory
				poNumber: po.poNumber,
				orderDate: po.orderDate,
				itemName: item.stockItem?.name,
				itemSku: item.stockItem?.sku,
				quantity: item.orderedQuantity,
				unitOfMeasure: item.stockItem?.unitOfMeasure,
				unitPrice: unitPrice,
				orderedBy: po.orderedBy?.name || 'N/A',
				orderedByRole: 'N/A',
				poStatus: po.status
			});

			totalAmount += amount;
			categories.add(category);

			// Add supplier to suppliers map if not already there
			if (supplierId && !suppliers.has(supplierId)) {
				suppliers.set(supplierId, {
					_id: supplierId,
					name: supplierName,
					code: supplierCode,
					contactPerson: contactInfo.contactPerson,
					phoneNumber: contactInfo.phoneNumber,
					email: contactInfo.email,
					address: contactInfo.address,
					terms: contactInfo.terms
				});
			}
		}
	}

	// Group items by site with enhanced structure
	const itemsBySite = Array.from(sites.values()).map(site => {
		const siteItems = items.filter(item => item.siteId === site._id);
		const siteTotal = siteItems.reduce((sum, item) => sum + item.amount, 0);
		const siteSupplierIds = new Set(siteItems.map(item => item.supplierId).filter(Boolean));

		// Group items by category for this site
		const siteCategoryMap = new Map<string, any[]>();
		siteItems.forEach(item => {
			if (!siteCategoryMap.has(item.category)) {
				siteCategoryMap.set(item.category, []);
			}
			siteCategoryMap.get(item.category)!.push(item);
		});

		// Create itemsByCategory structure for this site
		const itemsByCategory = Array.from(siteCategoryMap.entries()).map(([category, categoryItems]) => {
			const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);

			// Group by subCategory if available
			const subCategoryMap = new Map<string, any[]>();
			categoryItems.forEach(item => {
				const subCategory = item.subCategory || category;
				if (!subCategoryMap.has(subCategory)) {
					subCategoryMap.set(subCategory, []);
				}
				subCategoryMap.get(subCategory)!.push(item);
			});

			const itemsBySubCategory = Array.from(subCategoryMap.entries()).map(([subCategory, subCategoryItems]) => {
				const subCategoryTotal = subCategoryItems.reduce((sum, item) => sum + item.amount, 0);
				return {
					subCategory,
					items: subCategoryItems,
					totalAmount: subCategoryTotal,
					itemCount: subCategoryItems.length
				};
			});

			return {
				category,
				items: categoryItems,
				itemsBySubCategory,
				totalAmount: categoryTotal,
				itemCount: categoryItems.length
			};
		});

		// Get site suppliers (with full contact info)
		const siteSuppliers = Array.from(siteSupplierIds).map(id => {
			const supplier = suppliers.get(id);
			return supplier ? {
				_id: supplier._id,
				name: supplier.name,
				code: supplier.code,
				contactPerson: supplier.contactPerson,
				phoneNumber: supplier.phoneNumber,
				email: supplier.email,
				address: supplier.address,
				terms: supplier.terms
			} : null;
		}).filter(Boolean) as any[];

		return {
			site,
			items: siteItems,
			itemsByCategory,
			totalAmount: siteTotal,
			itemCount: siteItems.length,
			supplierCount: siteSupplierIds.size,
			siteSuppliers
		};
	});

	// Group items by category for the summary (using actual categories from database)
	const itemsByCategory = Array.from(categories).map(category => {
		const categoryItems = items.filter(item => item.category === category);
		const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);

		// Get category details from database
		const categoryDetails = allCategories.find((c: { title: string; }) => c.title === category);

		// Group by site for this category
		const siteMap = new Map<string, any[]>();
		categoryItems.forEach(item => {
			const siteKey = `${item.siteId}-${item.siteName}`;
			if (!siteMap.has(siteKey)) {
				siteMap.set(siteKey, []);
			}
			siteMap.get(siteKey)!.push(item);
		});

		const itemsBySite = Array.from(siteMap.entries()).map(([siteKey, siteItems]) => {
			const siteId = siteKey.split('-')[0];
			const siteName = siteKey.split('-')[1];
			const siteTotal = siteItems.reduce((sum, item) => sum + item.amount, 0);

			return {
				site: { _id: siteId, name: siteName },
				items: siteItems,
				totalAmount: siteTotal,
				itemCount: siteItems.length
			};
		});

		return {
			category,
			description: categoryDetails?.description || '',
			items: categoryItems,
			itemsBySite,
			totalAmount: categoryTotal,
			itemCount: categoryItems.length
		};
	});

	// Group items by supplier for the summary
	const itemsBySupplier = Array.from(suppliers.values()).map(supplier => {
		const supplierItems = items.filter(item => item.supplierId === supplier._id);
		const supplierTotal = supplierItems.reduce((sum, item) => sum + item.amount, 0);
		const supplierSiteIds = new Set(supplierItems.map(item => item.siteId).filter(Boolean));

		return {
			supplier,
			items: supplierItems,
			performance: {
				totalAmount: supplierTotal,
				itemCount: supplierItems.length,
				purchaseOrderCount: new Set(supplierItems.map(item => item.poNumber)).size,
				firstOrderDate: supplierItems.length > 0
					? supplierItems.reduce((earliest, item) =>
						earliest < item.orderDate ? earliest : item.orderDate,
						supplierItems[0].orderDate
					)
					: undefined,
				lastOrderDate: supplierItems.length > 0
					? supplierItems.reduce((latest, item) =>
						latest > item.orderDate ? latest : item.orderDate,
						supplierItems[0].orderDate
					)
					: undefined,
				averageOrderValue: supplierItems.length > 0 ? supplierTotal / supplierItems.length : 0,
				itemsPerPO: supplierItems.length / (new Set(supplierItems.map(item => item.poNumber)).size || 1),
				siteCount: supplierSiteIds.size,
				sites: Array.from(supplierSiteIds).map(id => sites.get(id)).filter(Boolean) as any[]
			},
			contactInfo: {
				contactPerson: supplier.contactPerson || 'N/A',
				phoneNumber: supplier.phoneNumber || 'N/A',
				email: supplier.email || 'N/A',
				address: supplier.address || 'N/A',
				terms: supplier.terms || 'N/A'
			}
		};
	});

	// Calculate stats
	const uniqueSuppliers = new Set(items.map(item => item.supplierId).filter(Boolean)).size;
	const uniquePOs = new Set(items.map(item => item.poNumber)).size;

	// Get all categories from database (not just those with items)
	const allCategoryTitles = allCategories.map((c: { title: any; }) => c.title);

	const stats = {
		totalAmount,
		totalItems: items.length,
		totalPurchaseOrders: uniquePOs,
		totalSites: sites.size,
		totalSuppliers: uniqueSuppliers,
		totalCategories: allCategoryTitles.length,
		usedCategories: categories.size,
		averageOrderValue: uniquePOs > 0 ? totalAmount / uniquePOs : 0,
		averageItemsPerPO: uniquePOs > 0 ? items.length / uniquePOs : 0,
		averageSupplierPerSite: itemsBySite.length > 0
			? uniqueSuppliers / itemsBySite.length
			: 0
	};

	// Supplier performance array (for backward compatibility)
	const supplierPerformance = Array.from(suppliers.values()).map(supplier => {
		const supplierItems = items.filter(item => item.supplierId === supplier._id);
		const supplierTotal = supplierItems.reduce((sum, item) => sum + item.amount, 0);

		return {
			supplier,
			totalAmount: supplierTotal,
			itemCount: supplierItems.length,
			purchaseOrderCount: new Set(supplierItems.map(item => item.poNumber)).size,
			firstOrderDate: supplierItems.length > 0
				? supplierItems.reduce((earliest, item) =>
					earliest < item.orderDate ? earliest : item.orderDate,
					supplierItems[0].orderDate
				)
				: undefined,
			lastOrderDate: supplierItems.length > 0
				? supplierItems.reduce((latest, item) =>
					latest > item.orderDate ? latest : item.orderDate,
					supplierItems[0].orderDate
				)
				: undefined
		};
	});

	return {
		items,
		itemsBySite,
		itemsByCategory,
		itemsBySupplier,
		stats,
		totalAmount,
		sites: Array.from(sites.values()),
		suppliers: Array.from(suppliers.values()),
		supplierPerformance,
		categories: allCategoryTitles, // Return ALL categories from database
		usedCategories: Array.from(categories), // Categories actually used in this report
		purchaseOrdersCount: uniquePOs,
		itemsCount: items.length,
		generatedAt: new Date().toISOString(),
		filters: {
			siteCount: sites.size,
			supplierCount: suppliers.size,
			categoryCount: categories.size
		}
	};
}

/**
 * Generate supplier code based on name
 */
function generateSupplierCode(supplierName: string): string {
	if (!supplierName) return '';

	// Use existing code if present, otherwise generate from name
	// Take first 3 letters, convert to uppercase, and pad if necessary
	const code = supplierName
		.replace(/[^A-Z]/gi, '')
		.toUpperCase()
		.substring(0, 3);

	return code || supplierName.substring(0, 3).toUpperCase();
}

// Add this function to fetch categories from the database
async function getCategories() {
	const categories = await client.fetch(groq`
    *[_type == "Category"] {
      _id,
      title,
      description,
      "siteMatchPatterns": siteMatchPatterns[] // Optional: Add field to store patterns
    }
  `);
	return categories;
}

// Replace the hardcoded determineCategory function with this:
async function determineCategory(siteName: string): Promise<string> {
	try {
		// Fetch all categories
		const categories = await getCategories();

		if (!categories || categories.length === 0) {
			console.warn('No categories found in database');
			return 'GENERAL SUPPLIES';
		}

		const lowerName = siteName.toLowerCase();

		// If categories have siteMatchPatterns, use them
		for (const category of categories) {
			if (category.siteMatchPatterns && Array.isArray(category.siteMatchPatterns)) {
				for (const pattern of category.siteMatchPatterns) {
					if (lowerName.includes(pattern.toLowerCase())) {
						return category.title;
					}
				}
			}
		}

		// Fallback: check if site name contains category keywords
		for (const category of categories) {
			if (lowerName.includes(category.title.toLowerCase())) {
				return category.title;
			}
		}

		// Return first category or default
		return categories[0]?.title || 'GENERAL SUPPLIES';

	} catch (error) {
		console.error('Error determining category:', error);
		return 'GENERAL SUPPLIES';
	}
}
