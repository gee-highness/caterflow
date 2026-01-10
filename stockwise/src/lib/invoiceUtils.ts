// lib/invoiceUtils.ts
export interface InvoiceMetadata {
	isInvoice: boolean;
	invoiceNumber: string;
	invoiceDate: string;
	invoiceAmount: number;
	supplier: string;
	userDescription?: string;
}

export function parseInvoiceMetadata(description: string | null): InvoiceMetadata | null {
	if (!description) return null;

	try {
		const parsed = JSON.parse(description);
		if (parsed.isInvoice) {
			return parsed as InvoiceMetadata;
		}
		return null;
	} catch (error) {
		// Not a JSON string, so it's a regular description
		return null;
	}
}

export function isInvoiceAttachment(description: string | null): boolean {
	return parseInvoiceMetadata(description) !== null;
}

export function getInvoiceDisplayInfo(description: string | null): {
	isInvoice: boolean;
	displayText: string;
	metadata?: InvoiceMetadata;
} {
	const metadata = parseInvoiceMetadata(description);

	if (metadata) {
		return {
			isInvoice: true,
			displayText: metadata.userDescription || `Invoice ${metadata.invoiceNumber} - ${metadata.supplier}`,
			metadata
		};
	}

	return {
		isInvoice: false,
		displayText: description || 'No description'
	};
}