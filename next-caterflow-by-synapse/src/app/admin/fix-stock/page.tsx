// /app/admin/fix-stock/page.tsx
'use client';
import { useState } from 'react';
import {
	Box,
	Heading,
	Button,
	Alert,
	AlertIcon,
	AlertTitle,
	AlertDescription,
	VStack,
	HStack,
	Text,
	Progress,
	Card,
	CardBody,
	Code,
	Badge,
	useToast,
	Container
} from '@chakra-ui/react';
import { FiAlertTriangle, FiCheckCircle, FiRefreshCw, FiDatabase } from 'react-icons/fi';

export default function FixStockPage() {
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [progress, setProgress] = useState({ stage: '', percentage: 0 });
	const [step, setStep] = useState<'idle' | 'clearing' | 'processing' | 'verifying' | 'complete' | 'error'>('idle');
	const toast = useToast();

	const fixStock = async () => {
		const password = prompt('Enter admin password:');
		if (!password) return;

		setLoading(true);
		setStep('clearing');
		setProgress({ stage: 'Clearing existing stock data...', percentage: 10 });

		try {
			// Step 1: Clear existing data
			const clearResponse = await fetch('/api/admin/reset-stock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					password,
					action: 'clear',
					batchSize: 50
				})
			});

			if (!clearResponse.ok) {
				const error = await clearResponse.json();
				throw new Error(error.error || 'Failed to clear data');
			}

			const clearResult = await clearResponse.json();
			setProgress({ stage: 'Processing goods receipts...', percentage: 40 });
			setStep('processing');

			// Step 2: Process goods receipts
			const processResponse = await fetch('/api/admin/fix-goods-receipts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					password,
					batchSize: 20
				})
			});

			if (!processResponse.ok) {
				const error = await processResponse.json();
				throw new Error(error.error || 'Failed to process receipts');
			}

			const processResult = await processResponse.json();
			setProgress({ stage: 'Verifying results...', percentage: 80 });
			setStep('verifying');

			// Step 3: Verify and get summary
			const verifyResponse = await fetch('/api/admin/stock-summary');
			const verifyResult = await verifyResponse.json();

			setProgress({ stage: 'Complete!', percentage: 100 });
			setStep('complete');

			setResult({
				success: true,
				cleared: clearResult,
				processed: processResult,
				verification: verifyResult,
				timestamp: new Date().toISOString()
			});

			toast({
				title: 'Stock Fix Complete',
				description: `Processed ${processResult.receiptsProcessed} receipts and ${processResult.itemsProcessed} items`,
				status: 'success',
				duration: 5000,
				isClosable: true,
			});

		} catch (error: any) {
			console.error('Fix failed:', error);
			setStep('error');
			setResult({
				error: true,
				message: error.message,
				timestamp: new Date().toISOString()
			});

			toast({
				title: 'Fix Failed',
				description: error.message,
				status: 'error',
				duration: 5000,
				isClosable: true,
			});
		} finally {
			setLoading(false);
		}
	};

	const getStepColor = () => {
		switch (step) {
			case 'clearing': return 'yellow';
			case 'processing': return 'blue';
			case 'verifying': return 'purple';
			case 'complete': return 'green';
			case 'error': return 'red';
			default: return 'gray';
		}
	};

	return (
		<Container maxW="4xl" py={8}>
			<VStack spacing={6} align="stretch">
				<Card>
					<CardBody>
						<VStack spacing={4} align="stretch">
							<HStack>
								<FiDatabase size={24} />
								<Heading size="lg">Stock Calculation Fix Tool</Heading>
							</HStack>

							<Alert status="warning" borderRadius="md">
								<AlertIcon />
								<Box>
									<AlertTitle>⚠️ Important Warning</AlertTitle>
									<AlertDescription>
										This will reset all stock calculations and recalculate from goods receipts.
										Only run during low-traffic periods.
									</AlertDescription>
								</Box>
							</Alert>

							<Box>
								<Text mb={2}>
									This tool will:
								</Text>
								<VStack align="start" spacing={2} pl={4}>
									<HStack><Text>•</Text><Text>Delete all existing StockSnapshot records</Text></HStack>
									<HStack><Text>•</Text><Text>Reset all BinStock quantities to 0</Text></HStack>
									<HStack><Text>•</Text><Text>Process all completed goods receipts</Text></HStack>
									<HStack><Text>•</Text><Text>Create new stock calculations</Text></HStack>
								</VStack>
							</Box>

							<Button
								colorScheme="red"
								size="lg"
								onClick={fixStock}
								isLoading={loading}
								loadingText={progress.stage}
								leftIcon={<FiRefreshCw />}
								isDisabled={loading}
							>
								{loading ? 'Fixing Stock...' : 'Run Stock Fix'}
							</Button>

							{loading && (
								<Box>
									<HStack justify="space-between" mb={2}>
										<Text fontWeight="medium">
											<Badge colorScheme={getStepColor()}>
												{step.toUpperCase()}
											</Badge>
											{' '}{progress.stage}
										</Text>
										<Text>{progress.percentage}%</Text>
									</HStack>
									<Progress
										value={progress.percentage}
										colorScheme={getStepColor()}
										hasStripe={step !== 'complete'}
										isAnimated={step !== 'complete'}
										size="lg"
										borderRadius="full"
									/>
								</Box>
							)}
						</VStack>
					</CardBody>
				</Card>

				{result && (
					<Card>
						<CardBody>
							<VStack spacing={4} align="stretch">
								<Heading size="md">
									{result.error ? '❌ Fix Failed' : '✅ Fix Complete'}
								</Heading>

								{result.error ? (
									<Alert status="error" borderRadius="md">
										<AlertIcon />
										<Box>
											<AlertTitle>Error</AlertTitle>
											<AlertDescription>{result.message}</AlertDescription>
										</Box>
									</Alert>
								) : (
									<>
										<Alert status="success" borderRadius="md">
											<AlertIcon />
											<Box>
												<AlertTitle>Success!</AlertTitle>
												<AlertDescription>
													Stock calculations have been reset and recalculated.
												</AlertDescription>
											</Box>
										</Alert>

										<Box>
											<Text fontWeight="bold" mb={2}>Summary:</Text>
											<VStack align="start" spacing={1}>
												<HStack><Text>•</Text><Text>Cleared: {result.cleared?.snapshotsDeleted || 0} snapshots</Text></HStack>
												<HStack><Text>•</Text><Text>Processed: {result.processed?.receiptsProcessed || 0} receipts</Text></HStack>
												<HStack><Text>•</Text><Text>Items: {result.processed?.itemsProcessed || 0} items</Text></HStack>
												<HStack><Text>•</Text><Text>Created: {result.processed?.binStocksCreated || 0} BinStock entries</Text></HStack>
												<HStack><Text>•</Text><Text>Created: {result.processed?.snapshotsCreated || 0} StockSnapshots</Text></HStack>
											</VStack>
										</Box>

										{result.verification && (
											<Box>
												<Text fontWeight="bold" mb={2}>Verification:</Text>
												<Code p={2} borderRadius="md" width="100%" whiteSpace="pre-wrap">
													{JSON.stringify(result.verification, null, 2)}
												</Code>
											</Box>
										)}
									</>
								)}

								<Box>
									<Text fontSize="sm" color="gray.500">
										Timestamp: {result.timestamp}
									</Text>
								</Box>
							</VStack>
						</CardBody>
					</Card>
				)}
			</VStack>
		</Container>
	);
}