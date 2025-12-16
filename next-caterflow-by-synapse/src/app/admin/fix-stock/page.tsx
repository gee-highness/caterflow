// /app/admin/fix-stock/page.tsx
'use client';
import { useState } from 'react';

export default function FixStockPage() {
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);

	const fixStock = async () => {
		setLoading(true);
		try {
			const response = await fetch('/api/fix/goods-receipt-stock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: 'YOUR_ADMIN_PASSWORD' })
			});
			const data = await response.json();
			setResult(data);
		} catch (error) {
			setResult({ error: 'Failed' });
		} finally {
			setLoading(false);
		}
	};

	return (
		<div>
			<h1>Fix Stock Calculations</h1>
			<button onClick={fixStock} disabled={loading}>
				{loading ? 'Fixing...' : 'Fix Stock'}
			</button>
			{result && <pre>{JSON.stringify(result, null, 2)}</pre>}
		</div>
	);
}