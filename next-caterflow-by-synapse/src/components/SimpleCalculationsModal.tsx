'use client';

import {
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalFooter,
	ModalBody,
	ModalCloseButton,
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
	Divider,
	Alert,
	AlertIcon,
	Spinner,
	Flex,
	Stat,
	StatLabel,
	StatNumber,
	StatHelpText,
	useColorModeValue
} from '@chakra-ui/react';
import { useMemo } from 'react';

interface Transaction {
	id: string;
	date: string;
	time: string;
	type: 'receipt' | 'dispatch' | 'transferIn' | 'transferOut' | 'count';
	badgeColor: string;
	badgeText: string;
	icon: string;
	documentNumber: string;
	quantity: string;
	rawQuantity: number;
	runningTotal: number;
	isNegative: boolean;
}

interface SimpleCalculationsModalProps {
	isOpen: boolean;
	onClose: () => void;
	stockItemName: string;
	binName: string;
	siteName: string;
	currentStock: number;
	isLoading: boolean;
	transactionHistory: any;
}

export default function SimpleCalculationsModal({
	isOpen,
	onClose,
	stockItemName,
	binName,
	siteName,
	currentStock,
	isLoading,
	transactionHistory
}: SimpleCalculationsModalProps) {
	// ✅ MOVE ALL HOOKS TO THE TOP - BEFORE ANY CONDITIONAL LOGIC
	const bgColor = useColorModeValue('white', 'gray.800');
	const borderColor = useColorModeValue('gray.200', 'gray.700');
	const theadBg = useColorModeValue('gray.50', 'gray.700');

	const getStockColor = (stock: number) => {
		if (stock < 0) return 'red.500';
		if (stock === 0) return 'orange.500';
		return 'green.500';
	};

	const getStockStatus = (stock: number) => {
		if (stock < 0) return 'NEGATIVE STOCK';
		if (stock === 0) return 'OUT OF STOCK';
		return 'IN STOCK';
	};

	// Use useMemo for derived values
	const { showTransactions, transactionCount, hasLastCount, startingPoint } = useMemo(() => {
		if (!transactionHistory?.success) {
			return {
				showTransactions: false,
				transactionCount: 0,
				hasLastCount: false,
				startingPoint: ''
			};
		}

		return {
			showTransactions: transactionHistory.transactions?.length > 0,
			transactionCount: transactionHistory.transactions?.length || 0,
			hasLastCount: !!transactionHistory.summary?.lastCount,
			startingPoint: transactionHistory.summary?.startingPoint || ''
		};
	}, [transactionHistory]);

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
			<ModalOverlay />
			<ModalContent bg={bgColor} maxH="90vh">
				<ModalHeader borderBottom="1px" borderColor={borderColor}>
					<VStack align="flex-start" spacing={1}>
						<Text fontSize="xl" fontWeight="bold">{stockItemName}</Text>
						<Text fontSize="sm" color="gray.600">
							📦 {binName} • 🏢 {siteName}
						</Text>
					</VStack>
				</ModalHeader>
				<ModalCloseButton />

				<ModalBody py={4}>
					{isLoading ? (
						<Flex justify="center" align="center" py={10} direction="column" gap={4}>
							<Spinner size="xl" thickness="4px" />
							<Text>Loading calculation details...</Text>
						</Flex>
					) : transactionHistory?.success ? (
						<VStack spacing={6} align="stretch">
							<Stat>
								<StatLabel fontSize="sm">Current Stock</StatLabel>
								<StatNumber fontSize="4xl" color={getStockColor(currentStock)}>
									{currentStock.toLocaleString()}
								</StatNumber>
								<StatHelpText>
									<Badge colorScheme={currentStock < 0 ? 'red' : currentStock === 0 ? 'orange' : 'green'}>
										{getStockStatus(currentStock)}
									</Badge>
									{startingPoint && (
										<Text fontSize="sm" mt={1}>
											📅 {startingPoint}
										</Text>
									)}
								</StatHelpText>
							</Stat>
							{/* Transaction Table */}
							<Box>
								<Text fontWeight="semibold" mb={3} fontSize="lg">📋 Transaction History</Text>
								<Box overflowX="auto" border="1px" borderColor={borderColor} borderRadius="md">
									<Table variant="simple" size="sm">
										<Thead bg={theadBg}>
											<Tr>
												<Th>Date & Time</Th>
												<Th>Document</Th>{/*}
												<Th isNumeric>Change</Th>*/}
												<Th isNumeric>Running Total</Th>
											</Tr>
										</Thead>
										<Tbody>
											{showTransactions ? (
												transactionHistory.transactions.map((tx: Transaction) => (
													<Tr
														key={tx.id}
														bg={tx.isNegative ? 'red.50' : 'transparent'}
														borderBottom="1px"
														borderColor={borderColor}
													>
														<Td>
															<VStack align="flex-start" spacing={0}>
																<Text fontSize="sm" fontWeight="medium">{tx.date}</Text>
																<Text fontSize="xs" color="gray.500">{tx.time}</Text>
															</VStack>
														</Td>

														<Td>
															<HStack spacing={2}>
																<Text fontSize="lg">{tx.icon}</Text>
																<Badge
																	colorScheme={tx.badgeColor}
																	variant="subtle"
																	fontSize="xs"
																	px={2}
																	py={0.5}
																>
																	{tx.documentNumber}
																</Badge>
															</HStack>
														</Td>{/*
														<Td isNumeric>
															<Text
																fontSize="sm"
																fontWeight="bold"
																color={tx.rawQuantity > 0 ? 'green.600' : tx.rawQuantity < 0 ? 'red.600' : 'purple.600'}
															>
																{tx.quantity}
															</Text>
														</Td>*/}
														<Td isNumeric>
															<Text
																fontSize="sm"
																fontWeight="bold"
																color={tx.runningTotal < 0 ? 'red.600' : tx.runningTotal === 0 ? 'orange.600' : 'inherit'}
															>
																{tx.runningTotal.toLocaleString()}
																{tx.isNegative && (
																	<Text as="span" ml={1} fontSize="xs" color="red.500">
																		(NEGATIVE)
																	</Text>
																)}
															</Text>
														</Td>
													</Tr>
												))
											) : (
												<Tr>
													<Td colSpan={5} textAlign="center" py={8}>
														<Text color="gray.500">No transaction history found</Text>
														<Text fontSize="sm" color="gray.400">
															This item has no recorded transactions in this bin
														</Text>
													</Td>
												</Tr>
											)}
										</Tbody>
									</Table>
								</Box>
							</Box>

							{/* Last Count Summary */}
							{hasLastCount && transactionHistory.summary?.lastCount && (
								<Box p={4} bg="blue.50" borderRadius="md" borderLeft="4px" borderColor="blue.500">
									<HStack spacing={3}>
										<Text fontSize="2xl">📋</Text>
										<Box>
											<Text fontWeight="bold">Baseline Inventory Count</Text>
											<Text fontSize="sm">
												Count {transactionHistory.summary.lastCount.documentNumber} on {new Date(transactionHistory.summary.lastCount.date).toLocaleDateString()}:
												<Badge ml={2} colorScheme="purple">
													{transactionHistory.summary.lastCount.quantity.toLocaleString()} units
												</Badge>
											</Text>
										</Box>
									</HStack>
								</Box>
							)}
						</VStack>
					) : (
						<Alert status="error" borderRadius="md">
							<AlertIcon />
							<Box>
								<Text fontWeight="bold">Error Loading Calculation History</Text>
								<Text fontSize="sm">{transactionHistory?.error || 'Failed to load transaction history'}</Text>
							</Box>
						</Alert>
					)}
				</ModalBody>

				<ModalFooter borderTop="1px" borderColor={borderColor}>
					<Button variant="ghost" mr={3} onClick={onClose}>
						Close
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}