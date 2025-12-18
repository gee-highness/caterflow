'use client';

import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalCloseButton,
	ModalBody,
	ModalFooter,
	Button,
	VStack,
	HStack,
	Text,
	Badge,
	Table,
	Thead,
	Tbody,
	Tr,
	Th,
	Td,
	Box,
	Alert,
	AlertIcon,
	AlertTitle,
	AlertDescription,
	Spinner,
	useColorModeValue,
	Card,
	CardBody,
	Divider,
	Flex,
	Tag,
	SimpleGrid,
	Icon,
} from '@chakra-ui/react';
import { FiFileText, FiAlertTriangle, FiCheckCircle, FiTrendingUp, FiTrendingDown, FiPackage, FiTruck, FiRefreshCw, FiDatabase } from 'react-icons/fi';
import { MdInventory } from 'react-icons/md';

// Safe interface with optional chaining
interface TransactionHistoryData {
	success?: boolean;
	error?: string;
	item?: {
		_id?: string;
		name?: string;
		sku?: string;
		unitOfMeasure?: string;
		minimumStockLevel?: number;
		reorderQuantity?: number;
	};
	bin?: {
		_id?: string;
		name?: string;
		site?: {
			_id?: string;
			name?: string;
		};
	};
	latestCount?: {
		date?: string;
		quantity?: number;
	} | null;
	transactions?: Array<{
		id?: string;
		date?: string;
		type?: 'receipt' | 'dispatch' | 'transferOut' | 'transferIn' | 'count';
		documentNumber?: string;
		quantity?: number;
		runningTotal?: number;
		description?: string;
		status?: string;
		unitPrice?: number;
	}>;
	summary?: {
		totalTransactions?: number;
		currentStock?: number;
		calculatedFrom?: string;
		goodsReceipts?: number;
		dispatches?: number;
		transfers?: number;
	};
}

interface CalculationsModalProps {
	isOpen: boolean;
	onClose: () => void;
	stockItemId: string;
	stockItemName: string;
	binId: string;
	binName: string;
	siteName: string;
	currentStock: number;
	isLoading: boolean;
	transactionHistory?: TransactionHistoryData | null;
}

export default function CalculationsModal({
	isOpen,
	onClose,
	stockItemId,
	stockItemName,
	binId,
	binName,
	siteName,
	currentStock,
	isLoading,
	transactionHistory,
}: CalculationsModalProps) {
	const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
	const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
	const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
	const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
	const bgPrimary = useColorModeValue('neutral.light.bg-primary', 'neutral.dark.bg-primary');

	const grayBgColor = useColorModeValue('gray.50', 'gray.700');
	const blueBgColor = useColorModeValue('blue.50', 'blue.900');
	const hoverBgColor = useColorModeValue('gray.50', 'gray.700');
	const tableHeaderBgColor = useColorModeValue('gray.50', 'gray.700');

	const getTransactionTypeColor = (type?: string) => {
		switch (type) {
			case 'receipt':
				return 'green';
			case 'transferIn':
				return 'teal';
			case 'dispatch':
				return 'orange';
			case 'transferOut':
				return 'red';
			case 'count':
				return 'blue';
			default:
				return 'gray';
		}
	};

	const getTransactionTypeIcon = (type?: string) => {
		switch (type) {
			case 'receipt':
				return <FiPackage />;
			case 'dispatch':
				return <FiTruck />;
			case 'transferOut':
				return <FiTrendingDown />;
			case 'transferIn':
				return <FiTrendingUp />;
			case 'count':
				return <MdInventory />;
			default:
				return <FiDatabase />;
		}
	};

	const formatTransactionType = (type?: string) => {
		switch (type) {
			case 'receipt':
				return 'Goods Receipt';
			case 'dispatch':
				return 'Dispatch';
			case 'transferOut':
				return 'Transfer Out';
			case 'transferIn':
				return 'Transfer In';
			case 'count':
				return 'Inventory Count';
			default:
				return type || 'Unknown';
		}
	};

	const getStatusColor = (status?: string) => {
		switch (status?.toLowerCase()) {
			case 'completed':
			case 'complete':
			case 'processed':
				return 'green';
			case 'pending':
			case 'draft':
				return 'yellow';
			case 'cancelled':
			case 'rejected':
				return 'red';
			default:
				return 'gray';
		}
	};

	const formatStatus = (status?: string) => {
		switch (status?.toLowerCase()) {
			case 'completed':
			case 'complete':
			case 'processed':
				return 'Completed';
			case 'pending':
				return 'Pending';
			case 'draft':
				return 'Draft';
			case 'cancelled':
				return 'Cancelled';
			case 'rejected':
				return 'Rejected';
			default:
				return status || 'Unknown';
		}
	};

	const formatDate = (dateString?: string) => {
		if (!dateString) return { date: 'N/A', time: '' };

		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return { date: 'Invalid Date', time: '' };

			return {
				date: date.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				}),
				time: date.toLocaleTimeString('en-US', {
					hour: '2-digit',
					minute: '2-digit',
					hour12: true
				})
			};
		} catch {
			return { date: 'Invalid Date', time: '' };
		}
	};

	// Safely get values with defaults
	const safeItemName = transactionHistory?.item?.name || stockItemName;
	const safeBinName = transactionHistory?.bin?.name || binName;
	const safeSiteName = transactionHistory?.bin?.site?.name || siteName;
	const safeCurrentStock = transactionHistory?.summary?.currentStock ?? currentStock;
	const safeTransactions = transactionHistory?.transactions || [];
	const safeTotalTransactions = transactionHistory?.summary?.totalTransactions || 0;
	const safeGoodsReceipts = transactionHistory?.summary?.goodsReceipts || 0;
	const safeDispatches = transactionHistory?.summary?.dispatches || 0;
	const safeCalculatedFrom = transactionHistory?.summary?.calculatedFrom || 'Beginning of records';
	const safeMinimumStockLevel = transactionHistory?.item?.minimumStockLevel || 0;
	const safeReorderQuantity = transactionHistory?.item?.reorderQuantity || 0;
	const safeUnitOfMeasure = transactionHistory?.item?.unitOfMeasure || 'units';
	const safeSku = transactionHistory?.item?.sku || 'N/A';

	const hasValidData = transactionHistory?.success === true;
	const hasError = transactionHistory?.error;
	const hasTransactions = safeTransactions.length > 0;

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
			<ModalOverlay backdropFilter="blur(4px)" />
			<ModalContent maxH="90vh" bg={bgPrimary}>
				<ModalHeader borderBottom="1px" borderColor={borderColor}>
					<VStack align="stretch" spacing={2}>
						<HStack justify="space-between">
							<Text fontSize="xl" fontWeight="bold" color={primaryTextColor}>
								Stock Calculation Details
							</Text>
							<Badge colorScheme="brand" fontSize="sm">
								Audit Trail
							</Badge>
						</HStack>
						<Text fontSize="sm" color={secondaryTextColor}>
							{safeItemName} • {safeBinName} • {safeSiteName}
						</Text>
					</VStack>
				</ModalHeader>
				<ModalCloseButton />
				<ModalBody p={6}>
					{isLoading ? (
						<VStack py={12} spacing={4}>
							<Spinner size="xl" color="brand.500" thickness="3px" />
							<VStack spacing={2}>
								<Text color={primaryTextColor} fontWeight="medium">
									Loading Transaction History
								</Text>
								<Text fontSize="sm" color={secondaryTextColor}>
									Gathering all stock movements from the database...
								</Text>
							</VStack>
						</VStack>
					) : hasError ? (
						<Alert status="error" borderRadius="md">
							<AlertIcon />
							<Box flex="1">
								<AlertTitle>Failed to Load History</AlertTitle>
								<AlertDescription>
									{transactionHistory?.error || 'Unable to load transaction history. Please try again.'}
								</AlertDescription>
							</Box>
						</Alert>
					) : !hasValidData ? (
						<Alert status="info" borderRadius="md">
							<AlertIcon />
							<Box flex="1">
								<AlertTitle>No Transaction History Available</AlertTitle>
								<AlertDescription>
									Unable to load transaction history for this item. This might be because:
									<VStack align="start" spacing={1} mt={2}>
										<Text fontSize="sm">• No transactions have been recorded for this item in this bin</Text>
										<Text fontSize="sm">• The item may not exist in this location</Text>
										<Text fontSize="sm">• There might be a connection issue with the database</Text>
									</VStack>
								</AlertDescription>
							</Box>
						</Alert>
					) : (
						<VStack spacing={6} align="stretch">
							{/* Header with Item & Bin Info */}
							<Card bg={bgCard} borderColor={borderColor} borderWidth="1px" shadow="sm">
								<CardBody>
									<SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
										<VStack align="stretch" spacing={3}>
											<HStack>
												<Icon as={FiPackage} color="brand.500" />
												<Text fontWeight="bold" color={primaryTextColor} fontSize="lg">
													Item Details
												</Text>
											</HStack>
											<VStack align="stretch" spacing={1}>
												<HStack justify="space-between">
													<Text fontWeight="medium">Name:</Text>
													<Text color={primaryTextColor}>{safeItemName}</Text>
												</HStack>
												<HStack justify="space-between">
													<Text fontWeight="medium">SKU:</Text>
													<Text color={secondaryTextColor}>{safeSku}</Text>
												</HStack>
												<HStack justify="space-between">
													<Text fontWeight="medium">Unit:</Text>
													<Badge colorScheme="blue">{safeUnitOfMeasure}</Badge>
												</HStack>
											</VStack>
										</VStack>

										<VStack align="stretch" spacing={3}>
											<HStack>
												<Icon as={FiDatabase} color="brand.500" />
												<Text fontWeight="bold" color={primaryTextColor} fontSize="lg">
													Location Details
												</Text>
											</HStack>
											<VStack align="stretch" spacing={1}>
												<HStack justify="space-between">
													<Text fontWeight="medium">Bin:</Text>
													<Text color={primaryTextColor}>{safeBinName}</Text>
												</HStack>
												<HStack justify="space-between">
													<Text fontWeight="medium">Site:</Text>
													<Text color={secondaryTextColor}>{safeSiteName}</Text>
												</HStack>
												{transactionHistory?.latestCount && (
													<HStack justify="space-between">
														<Text fontWeight="medium">Last Count:</Text>
														<Badge colorScheme="blue">
															{formatDate(transactionHistory.latestCount.date).date} ({transactionHistory.latestCount.quantity || 0})
														</Badge>
													</HStack>
												)}
											</VStack>
										</VStack>
									</SimpleGrid>
								</CardBody>
							</Card>

							{/* Summary Cards */}
							<SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
								<Card bg={bgCard} borderColor={borderColor} borderWidth="1px">
									<CardBody>
										<VStack spacing={3}>
											<Badge colorScheme="green" px={3} py={1} borderRadius="full">
												Current Stock
											</Badge>
											<Text fontSize="2xl" fontWeight="bold" color="green.500">
												{safeCurrentStock}
											</Text>
											<Text fontSize="sm" color={secondaryTextColor} textAlign="center">
												Units in {safeBinName}
											</Text>
										</VStack>
									</CardBody>
								</Card>

								<Card bg={bgCard} borderColor={borderColor} borderWidth="1px">
									<CardBody>
										<VStack spacing={3}>
											<Badge colorScheme="blue" px={3} py={1} borderRadius="full">
												Total Events
											</Badge>
											<Text fontSize="2xl" fontWeight="bold">
												{safeTotalTransactions}
											</Text>
											<VStack spacing={0}>
												<Text fontSize="xs" color={secondaryTextColor}>
													Since
												</Text>
												<Text fontSize="xs" color={secondaryTextColor}>
													{safeCalculatedFrom}
												</Text>
											</VStack>
										</VStack>
									</CardBody>
								</Card>

								<Card bg={bgCard} borderColor={borderColor} borderWidth="1px">
									<CardBody>
										<VStack spacing={3}>
											<Badge colorScheme="orange" px={3} py={1} borderRadius="full">
												Incoming
											</Badge>
											<Text fontSize="2xl" fontWeight="bold">
												{safeGoodsReceipts}
											</Text>
											<Text fontSize="sm" color={secondaryTextColor}>
												Goods Receipts
											</Text>
										</VStack>
									</CardBody>
								</Card>

								<Card bg={bgCard} borderColor={borderColor} borderWidth="1px">
									<CardBody>
										<VStack spacing={3}>
											<Badge colorScheme="red" px={3} py={1} borderRadius="full">
												Outgoing
											</Badge>
											<Text fontSize="2xl" fontWeight="bold">
												{safeDispatches}
											</Text>
											<Text fontSize="sm" color={secondaryTextColor}>
												Dispatches & Transfers
											</Text>
										</VStack>
									</CardBody>
								</Card>
							</SimpleGrid>

							{/* Calculation Timeline */}
							<Card bg={bgCard} borderColor={borderColor} borderWidth="1px" shadow="sm">
								<CardBody>
									<VStack align="stretch" spacing={4}>
										<Flex justify="space-between" align="center">
											<HStack>
												<Icon as={FiRefreshCw} color="brand.500" />
												<Text fontWeight="bold" color={primaryTextColor} fontSize="lg">
													Stock Calculation Timeline
												</Text>
											</HStack>
											<Badge colorScheme="gray" fontSize="xs">
												{safeTransactions.length} Events
											</Badge>
										</Flex>

										{!hasTransactions ? (
											<Alert status="info" borderRadius="md">
												<AlertIcon />
												<Box flex="1">
													<AlertTitle>No Transaction History</AlertTitle>
													<AlertDescription>
														No stock movements recorded for this item in {safeBinName}.
														This could mean the item was never received, dispatched, or counted in this bin.
													</AlertDescription>
												</Box>
											</Alert>
										) : (
											<>
												<Box overflowX="auto" borderRadius="md" border="1px" borderColor={borderColor}>
													<Table variant="simple" size="sm">
														<Thead bg={grayBgColor}>
															<Tr>
																<Th width="180px">Date & Time</Th>
																<Th>Document</Th>
																<Th>Type</Th>
																<Th isNumeric width="100px">Quantity</Th>
																<Th isNumeric width="120px">Running Total</Th>
																<Th>Description</Th>
																<Th width="100px">Status</Th>
															</Tr>
														</Thead>
														<Tbody>
															{safeTransactions.map((tx, index) => {
																const formattedDate = formatDate(tx.date);
																const quantity = tx.quantity || 0;
																const runningTotal = tx.runningTotal || 0;

																return (
																	<Tr
																		key={index}
																		_hover={{ bg: hoverBgColor }}
																	>
																		<Td>
																			<VStack align="start" spacing={0}>
																				<Text fontSize="sm" fontWeight="medium">
																					{formattedDate.date}
																				</Text>
																				<Text fontSize="xs" color={secondaryTextColor}>
																					{formattedDate.time}
																				</Text>
																			</VStack>
																		</Td>
																		<Td>
																			<Text fontSize="sm" fontWeight="medium" color="brand.500">
																				{tx.documentNumber || `TX-${index + 1}`}
																			</Text>
																		</Td>
																		<Td>
																			<HStack spacing={2}>
																				{/*<Icon as={getTransactionTypeIcon(tx.type)} />*/}
																				<Badge
																					colorScheme={getTransactionTypeColor(tx.type)}
																					variant="subtle"
																					px={2}
																					py={0.5}
																				>
																					{formatTransactionType(tx.type)}
																				</Badge>
																			</HStack>
																		</Td>
																		<Td isNumeric>
																			<Text
																				fontSize="sm"
																				fontWeight="bold"
																				color={quantity >= 0 ? 'green.500' : 'red.500'}
																			>
																				{quantity >= 0 ? '+' : ''}{quantity}
																			</Text>
																		</Td>
																		<Td isNumeric>
																			<Text
																				fontSize="sm"
																				fontWeight="bold"
																				color={
																					runningTotal <= 0
																						? 'red.500'
																						: runningTotal <= safeMinimumStockLevel
																							? 'orange.500'
																							: 'green.500'
																				}
																			>
																				{runningTotal}
																			</Text>
																			{safeMinimumStockLevel > 0 &&
																				runningTotal <= safeMinimumStockLevel && (
																					<Text fontSize="xs" color="orange.500">
																						Below min ({safeMinimumStockLevel})
																					</Text>
																				)}
																		</Td>
																		<Td>
																			<VStack align="start" spacing={0}>
																				<Text fontSize="sm">
																					{tx.description || `Transaction ${index + 1}`}
																				</Text>
																				{tx.unitPrice !== undefined && (
																					<Text fontSize="xs" color={secondaryTextColor}>
																						Unit Price: ${tx.unitPrice.toFixed(2)}
																					</Text>
																				)}
																			</VStack>
																		</Td>
																		<Td>
																			<Tag
																				size="sm"
																				colorScheme={getStatusColor(tx.status)}
																				variant="subtle"
																				width="full"
																				justifyContent="center"
																			>
																				{formatStatus(tx.status)}
																			</Tag>
																		</Td>
																	</Tr>
																);
															})}
														</Tbody>
													</Table>
												</Box>

												{/* Timeline Summary */}
												<Box mt={4} p={4} bg={blueBgColor} borderRadius="md">
													<SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
														<VStack align="center" spacing={1}>
															<Text fontSize="sm" color="blue.600" fontWeight="medium">
																Starting Point
															</Text>
															<Text fontSize="xs">
																{transactionHistory?.latestCount
																	? `Inventory Count: ${transactionHistory.latestCount.quantity || 0} units`
																	: 'No previous count found'
																}
															</Text>
														</VStack>
														<VStack align="center" spacing={1}>
															<Text fontSize="sm" color="blue.600" fontWeight="medium">
																Total Incoming
															</Text>
															<Text fontSize="xs">
																{safeTransactions
																	.filter(tx => (tx.quantity || 0) > 0)
																	.reduce((sum, tx) => sum + (tx.quantity || 0), 0)} units
															</Text>
														</VStack>
														<VStack align="center" spacing={1}>
															<Text fontSize="sm" color="blue.600" fontWeight="medium">
																Total Outgoing
															</Text>
															<Text fontSize="xs">
																{Math.abs(safeTransactions
																	.filter(tx => (tx.quantity || 0) < 0)
																	.reduce((sum, tx) => sum + (tx.quantity || 0), 0))} units
															</Text>
														</VStack>
													</SimpleGrid>
												</Box>
											</>
										)}
									</VStack>
								</CardBody>
							</Card>

							{/* Stock Level Analysis */}
							<Card bg={bgCard} borderColor={borderColor} borderWidth="1px">
								<CardBody>
									<VStack align="stretch" spacing={4}>
										<HStack>
											<Icon as={FiTrendingUp} color="brand.500" />
											<Text fontWeight="bold" color={primaryTextColor} fontSize="lg">
												Stock Level Analysis
											</Text>
										</HStack>

										<SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
											<VStack align="stretch" spacing={2} p={3} bg={grayBgColor} borderRadius="md">
												<Text fontWeight="medium" fontSize="sm">Minimum Stock Level</Text>
												<HStack justify="space-between">
													<Text color={secondaryTextColor}>Required:</Text>
													<Badge
														colorScheme={
															safeCurrentStock >= safeMinimumStockLevel
																? 'green'
																: 'red'
														}
													>
														{safeMinimumStockLevel} units
													</Badge>
												</HStack>
												<Text fontSize="xs" color={secondaryTextColor}>
													This is the minimum quantity that should be maintained in stock
												</Text>
											</VStack>

											<VStack align="stretch" spacing={2} p={3} bg={grayBgColor} borderRadius="md">
												<Text fontWeight="medium" fontSize="sm">Reorder Quantity</Text>
												<HStack justify="space-between">
													<Text color={secondaryTextColor}>Suggested:</Text>
													<Badge colorScheme="purple">
														{safeReorderQuantity} units
													</Badge>
												</HStack>
												<Text fontSize="xs" color={secondaryTextColor}>
													Recommended quantity to order when stock is low
												</Text>
											</VStack>
										</SimpleGrid>

										{/* Stock Status */}
										<Box p={4} borderRadius="md" border="1px" borderColor={borderColor}>
											<Text fontWeight="medium" mb={2}>Current Stock Status:</Text>
											<HStack justify="space-between">
												<Text color={secondaryTextColor}>Current Level:</Text>
												<Badge
													colorScheme={
														safeCurrentStock <= 0
															? 'red'
															: safeCurrentStock <= safeMinimumStockLevel
																? 'orange'
																: 'green'
													}
													fontSize="md"
													px={3}
													py={1}
												>
													{safeCurrentStock <= 0
														? 'OUT OF STOCK'
														: safeCurrentStock <= safeMinimumStockLevel
															? 'LOW STOCK'
															: 'IN STOCK'
													}
												</Badge>
											</HStack>
										</Box>
									</VStack>
								</CardBody>
							</Card>
						</VStack>
					)}
				</ModalBody>
				<ModalFooter borderTop="1px" borderColor={borderColor}>
					<Button variant="ghost" mr={3} onClick={onClose}>
						Close
					</Button>
					<Button
						colorScheme="brand"
						onClick={onClose}
					>
						Done
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}