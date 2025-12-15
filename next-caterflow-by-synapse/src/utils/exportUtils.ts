// utils/exportUtils.ts
export interface ExportReport {
	htmlContent: string;
	windowName: string;
	displayName?: string;
}

export interface ExportProgress {
	current: number;
	total: number;
	fileName: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

export async function exportReportsSequentially(
	reports: ExportReport[],
	onProgress?: ProgressCallback
): Promise<void> {
	for (let i = 0; i < reports.length; i++) {
		const report = reports[i];

		if (onProgress) {
			onProgress({
				current: i + 1,
				total: reports.length,
				fileName: report.displayName || report.windowName
			});
		}

		await new Promise<void>(async (resolve) => {
			try {
				// Create and prepare the window
				const exportWindow = window.open('', '_blank');

				if (!exportWindow) {
					console.warn('Popup blocked. Please allow popups for this site.');
					resolve();
					return;
				}

				// Optimize HTML generation by using template literals without intermediate arrays
				exportWindow.document.write(report.htmlContent);
				exportWindow.document.close();
				exportWindow.document.title = report.windowName;

				// Wait for DOM to be ready
				await new Promise<void>((readyResolve) => {
					if (exportWindow.document.readyState === 'complete') {
						readyResolve();
						return;
					}

					const onLoad = () => {
						exportWindow.removeEventListener('DOMContentLoaded', onLoad);
						readyResolve();
					};

					exportWindow.addEventListener('DOMContentLoaded', onLoad);
					setTimeout(() => readyResolve(), 50); // Fallback timeout
				});

				// Try to print
				setTimeout(() => {
					try {
						exportWindow.print();
					} catch (printErr) {
						console.warn('Auto-print failed:', printErr);
					}

					// Monitor window closure
					let checkCount = 0;
					const maxChecks = 300; // 30 seconds max (100ms interval)

					const checkClosed = setInterval(() => {
						checkCount++;

						if (exportWindow.closed || checkCount >= maxChecks) {
							clearInterval(checkClosed);
							resolve();

							// Force close if still open after timeout
							if (!exportWindow.closed && checkCount >= maxChecks) {
								try {
									exportWindow.close();
								} catch (e) {
									console.warn('Could not close window:', e);
								}
							}
						}
					}, 100);
				}, 50);

			} catch (err) {
				console.error('Export window error:', err);
				resolve();
			}
		});
	}

	// Final progress update
	if (onProgress) {
		onProgress({
			current: reports.length,
			total: reports.length,
			fileName: 'Complete'
		});
	}
}