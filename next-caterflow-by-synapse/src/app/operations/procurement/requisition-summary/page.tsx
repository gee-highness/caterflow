// src/app/operations/procurement/requisition-summary/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, SetStateAction } from 'react';
import {
	Box,
	Heading,
	Button,
	Flex,
	Spinner,
	useToast,
	useColorModeValue,
	Card,
	CardBody,
	Text,
	VStack,
	HStack,
	Table,
	Thead,
	Tbody,
	Tr,
	Th,
	Td,
	TableContainer,
	Select,
	FormControl,
	FormLabel,
	Alert,
	AlertIcon,
	AlertTitle,
	AlertDescription,
	Badge,
	Icon,
	useDisclosure,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalBody,
	ModalFooter,
	Tabs,
	TabList,
	TabPanels,
	Tab,
	TabPanel,
	Input,
	InputGroup,
	InputLeftElement,
	Stat,
	StatLabel,
	StatNumber,
	StatHelpText,
	StatArrow,
	Skeleton,
	Tooltip,
	IconButton,
	Progress,
	useBreakpointValue,
	TextProps,
	ModalCloseButton,
} from '@chakra-ui/react';
import {
	FiDownload,
	FiPrinter,
	FiFilter,
	FiCalendar,
	FiHome,
	FiFileText,
	FiExternalLink,
	FiRefreshCw,
	FiEye,
	FiTrendingUp,
	FiPackage,
	FiDollarSign,
	FiCheckCircle,
	FiChevronRight,
	FiChevronLeft,
	FiSearch,
	FiGrid,
	FiList,
	FiBarChart2
} from 'react-icons/fi';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import dynamic from 'next/dynamic';


interface CurrencyIconProps extends TextProps {
	// Add at least one member
	_?: never;
}

const CurrencyIcon = (props: CurrencyIconProps) => {
	// Returns the standard symbol for emalangeni: "E"
	return <Text as="span" fontWeight="bold" {...props}>E</Text>;
};

import "react-datepicker/dist/react-datepicker.css";
import { DatePickerProps } from 'react-datepicker';
import DatePicker from '@/components/DatePickerWrapper';

interface Site {
	_id: string;
	name: string;
}

interface Supplier {
	_id: string;
	name: string;
	code?: string;
}

interface RequisitionItem {
	siteId: string;
	siteName: string;
	supplierId: string;
	supplierName: string;
	supplierCode?: string;
	amount: number;
	category: string;
	poNumber: string;
	orderDate: string;
	itemName: string;
	itemSku?: string;
	quantity: number;
	unitOfMeasure: string;
	unitPrice: number;
}

interface RequisitionSummary {
	items: RequisitionItem[];
	itemsBySite: Array<{
		site: Site;
		items: RequisitionItem[];
		totalAmount: number;
	}>;
	itemsByCategory: Array<{
		category: string;
		items: RequisitionItem[];
		totalAmount: number;
	}>;
	totalAmount: number;
	sites: Site[];
	suppliers: Supplier[];
	categories: string[];
	purchaseOrdersCount: number;
	itemsCount: number;
}

// Cache to prevent unnecessary re-fetches
const dataCache = new Map();

export default function RequisitionSummaryPage() {
	const { data: session, status } = useSession();
	const [loading, setLoading] = useState(true);
	const [exporting, setExporting] = useState(false);
	const [summary, setSummary] = useState<RequisitionSummary | null>(null);
	const [selectedSite, setSelectedSite] = useState<string>('all');

	const [searchQuery, setSearchQuery] = useState('');
	const [activeTab, setActiveTab] = useState(0);
	const [isInitialLoad, setIsInitialLoad] = useState(true);
	const toast = useToast();
	const { isOpen: isExportModalOpen, onOpen: onExportModalOpen, onClose: onExportModalClose } = useDisclosure();

	// Responsive values
	const isMobile = useBreakpointValue({ base: true, md: false });
	const tableSize = useBreakpointValue({ base: 'sm', md: 'md' });
	const { isOpen, onOpen, onClose } = useDisclosure();
	const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([null, null]);
	const [startDate, endDate] = dateRange;


	// Theming - matching your existing procurement page
	const bgPrimary = useColorModeValue('neutral.light.bg-primary', 'neutral.dark.bg-primary');
	const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
	const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
	const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
	const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
	const accentColor = useColorModeValue('brand.500', 'brand.300');
	const successColor = useColorModeValue('green.500', 'green.300');
	const warningColor = useColorModeValue('orange.500', 'orange.300');
	const hoverColor = useColorModeValue('gray.50', 'gray.700');

	// Generate cache key for current filters
	const getCacheKey = useCallback(() => {
		const keyParts = [
			selectedSite,
			startDate?.toISOString().split('T')[0] || 'null',
			endDate?.toISOString().split('T')[0] || 'null'
		];
		return keyParts.join('|');
	}, [selectedSite, startDate, endDate]);

	// Fetch requisition summary with caching
	const fetchRequisitionSummary = useCallback(async (forceRefresh = false) => {
		const cacheKey = getCacheKey();

		// Check cache first (unless force refresh)
		if (!forceRefresh && dataCache.has(cacheKey)) {
			setSummary(dataCache.get(cacheKey));
			setLoading(false);
			setIsInitialLoad(false);
			return;
		}

		setLoading(true);

		// Show loading state for better UX
		if (isInitialLoad) {
			await new Promise(resolve => setTimeout(resolve, 300)); // Small delay for smoother UX
		}

		try {
			const params = new URLSearchParams();

			if (selectedSite && selectedSite !== 'all') {
				params.append('siteId', selectedSite);
			}

			if (startDate) {
				params.append('startDate', startDate.toISOString());
			}

			if (endDate) {
				params.append('endDate', endDate.toISOString());
			}

			// Only fetch approved POs for requisition summary
			params.append('status', 'approved');

			const response = await fetch(`/api/procurement/requisition-summary?${params}`);

			if (!response.ok) {
				throw new Error('Failed to fetch requisition summary');
			}

			const data = await response.json();

			// Cache the result
			dataCache.set(cacheKey, data);
			setSummary(data);

			if (isInitialLoad) {
				toast({
					title: 'Data Loaded',
					description: 'Requisition summary is ready',
					status: 'success',
					duration: 2000,
					isClosable: true,
					position: 'top-right',
				});
				setIsInitialLoad(false);
			}

		} catch (err: any) {
			console.error(err);

			// Don't show error toast on initial load to prevent disruption
			if (!isInitialLoad) {
				toast({
					title: 'Error',
					description: err?.message || 'Failed to load requisition summary',
					status: 'error',
					duration: 3000,
					isClosable: true,
					position: 'top-right',
				});
			}
		} finally {
			setLoading(false);
		}
	}, [selectedSite, startDate, endDate, getCacheKey, isInitialLoad, toast]);

	// Optimized useEffect with debouncing
	useEffect(() => {
		if (status === 'authenticated') {
			const timer = setTimeout(() => {
				fetchRequisitionSummary();
			}, 300); // Debounce to prevent rapid refetches

			return () => clearTimeout(timer);
		}
	}, [status, fetchRequisitionSummary]);

	// Filter items based on search
	const filteredItems = useMemo(() => {
		if (!summary) return [];

		if (!searchQuery.trim()) return summary.items;

		const query = searchQuery.toLowerCase();
		return summary.items.filter(item =>
			item.supplierName.toLowerCase().includes(query) ||
			item.siteName.toLowerCase().includes(query) ||
			item.itemName.toLowerCase().includes(query) ||
			item.poNumber.toLowerCase().includes(query) ||
			item.category.toLowerCase().includes(query)
		);
	}, [summary, searchQuery]);

	// Group filtered items by site
	const filteredItemsBySite = useMemo(() => {
		if (!summary) return [];

		const itemsToUse = searchQuery ? filteredItems : summary.items;

		return Array.from(new Set(itemsToUse.map(item => item.siteId))).map(siteId => {
			const siteItems = itemsToUse.filter(item => item.siteId === siteId);
			const site = summary.sites.find(s => s._id === siteId) || { _id: siteId, name: 'Unknown Site' };
			const siteTotal = siteItems.reduce((sum, item) => sum + item.amount, 0);

			return {
				site,
				items: siteItems,
				totalAmount: siteTotal
			};
		}).filter(group => group.items.length > 0);
	}, [summary, filteredItems, searchQuery]);

	// Group filtered items by category
	const filteredItemsByCategory = useMemo(() => {
		if (!summary) return [];

		const itemsToUse = searchQuery ? filteredItems : summary.items;

		return Array.from(new Set(itemsToUse.map(item => item.category))).map(category => {
			const categoryItems = itemsToUse.filter(item => item.category === category);
			const categoryTotal = categoryItems.reduce((sum, item) => sum + item.amount, 0);

			return {
				category,
				items: categoryItems,
				totalAmount: categoryTotal
			};
		}).filter(group => group.items.length > 0);
	}, [summary, filteredItems, searchQuery]);

	// Calculate summary stats
	const stats = useMemo(() => {
		if (!summary) return null;

		const itemsToUse = searchQuery ? filteredItems : summary.items;
		const totalAmount = itemsToUse.reduce((sum, item) => sum + item.amount, 0);
		const uniqueSuppliers = new Set(itemsToUse.map(item => item.supplierId)).size;
		const uniqueSites = new Set(itemsToUse.map(item => item.siteId)).size;

		return {
			totalAmount,
			itemCount: itemsToUse.length,
			uniqueSuppliers,
			uniqueSites,
			averagePerItem: itemsToUse.length > 0 ? totalAmount / itemsToUse.length : 0
		};
	}, [summary, filteredItems, searchQuery]);

	// Export to PDF function
	const exportToPDF = async () => {
		if (!summary) return;

		try {
			setExporting(true);

			const htmlContent = generateRequisitionHTML(summary);

			const exportWindow = window.open('', '_blank');
			if (!exportWindow) {
				throw new Error('Popup blocked. Please allow popups for this site.');
			}

			exportWindow.document.write(htmlContent);
			exportWindow.document.close();
			exportWindow.document.title = `Requisition-Summary-${new Date().toISOString().split('T')[0]}`;

			exportWindow.onload = () => {
				setTimeout(() => {
					try {
						exportWindow.print();
						toast({
							title: 'Print Started',
							description: 'Document sent to printer',
							status: 'success',
							duration: 3000,
							isClosable: true,
							position: 'top-right',
						});
					} catch (printErr) {
						console.warn('Auto-print failed:', printErr);
						toast({
							title: 'Print Ready',
							description: 'Document is ready for manual printing (Ctrl+P)',
							status: 'info',
							duration: 4000,
							isClosable: true,
							position: 'top-right',
						});
					}
				}, 500);
			};

			onExportModalClose();
		} catch (err: any) {
			console.error('Export failed:', err);
			toast({
				title: 'Export Failed',
				description: err?.message || 'Failed to generate requisition',
				status: 'error',
				duration: 5000,
				isClosable: true,
				position: 'top-right',
			});
		} finally {
			setExporting(false);
		}
	};

	// Generate HTML for PDF export
	const generateRequisitionHTML = (summaryData: RequisitionSummary) => {
		const currentDate = new Date().toLocaleDateString('en-GB', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});

		return `
<!DOCTYPE html>
<html>
<head>
    <title>Requisition Summary - ${currentDate}</title>
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
            margin: 20px; 
            color: #000;
            font-size: 12px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #0067FF;
            padding-bottom: 15px;
        }
        
        .header h1 {
            margin: 0;
            font-size: 18px;
            text-transform: uppercase;
            font-weight: bold;
            color: #0067FF;
        }
        
        .header h2 {
            margin: 5px 0;
            font-size: 14px;
            color: #333;
        }
        
        .date-info {
            text-align: right;
            margin-bottom: 15px;
            font-size: 11px;
            color: #666;
        }
        
        .section-title {
            background-color: #f0f0f0;
            font-weight: bold;
            padding: 8px 10px;
            margin: 15px 0 10px 0;
            border: 1px solid #ccc;
            font-size: 13px;
            color: #0067FF;
        }
        
        .requisition-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
            font-size: 11px;
        }
        
        .requisition-table th {
            background-color: #e8e8e8;
            border: 1px solid #000;
            padding: 6px 4px;
            text-align: left;
            font-weight: bold;
        }
        
        .requisition-table td {
            border: 1px solid #000;
            padding: 5px 4px;
            vertical-align: top;
        }
        
        .amount-cell {
            text-align: right;
            font-family: monospace;
        }
        
        .total-row {
            background-color: #f5f5f5;
            font-weight: bold;
        }
        
        .grand-total {
            border-top: 2px double #000;
            font-size: 14px;
            font-weight: bold;
            text-align: right;
            padding: 10px 0;
            margin-top: 20px;
            color: #0067FF;
        }
        
        .currency-symbol {
            font-family: monospace;
            color: #0067FF;
        }
        
        .signature-section {
            margin-top: 40px;
            border-top: 1px solid #000;
            padding-top: 20px;
        }
        
        .signature-line {
            display: inline-block;
            width: 200px;
            border-top: 1px solid #000;
            margin: 0 30px;
            padding-top: 5px;
            text-align: center;
            font-size: 11px;
        }
        
        .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 9px;
            color: #666;
        }
        
        @media print {
            body { 
                margin: 15px;
            }
            .no-print { 
                display: none; 
            }
            .header {
                margin-bottom: 15px;
            }
        }

		/* Ensure date picker appears above everything */
  .react-datepicker-popper {
    z-index: 10000 !important;
  }
  
  .react-datepicker {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
    border: 1px solid #e2e8f0;
    border-radius: 0.375rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  }
  
  .react-datepicker__header {
    background-color: #f7fafc;
    border-bottom: 1px solid #e2e8f0;
  }
  
  .react-datepicker__day--selected {
    background-color: #3182ce;
  }
  
  .react-datepicker__day--selected:hover {
    background-color: #2c5282;
  }
  
  /* Ensure the triangle pointer is visible */
  .react-datepicker__triangle {
    z-index: 10001 !important;
  }
  
  /* If using month/year dropdowns */
  .react-datepicker__year-dropdown-container,
  .react-datepicker__month-dropdown-container {
    z-index: 10002 !important;
  }
    </style>
</head>
<body>



    <div class="header">
        <h1>REQUESTED STOCK SPREADSHEET</h1>
        <h2>REQUISITION SUMMARY</h2>
        <p>Date: ${currentDate}</p>
    </div>
    
    <div class="date-info">
        <strong>Period:</strong> ${startDate ? startDate.toLocaleDateString() : 'All dates'}
        ${endDate ? ' to ' + endDate.toLocaleDateString() : ''}
    </div>
    
    ${summaryData.itemsByCategory.map((categoryGroup, index) => `
        <div class="section-title">${categoryGroup.category}</div>
        <table class="requisition-table">
            <thead>
                <tr>
                    <th width="35%">CATERING / UNITS</th>
                    <th width="15%">CODE</th>
                    <th width="20%">AMOUNT</th>
                    <th width="20%">P.A</th>
                    <th width="10%">REMARKS</th>
                </tr>
            </thead>
            <tbody>
                ${categoryGroup.items.map((item, itemIndex) => `
                    <tr>
                        <td>${item.supplierName}</td>
                        <td>${item.supplierCode || 'N/A'}</td>
                        <td class="amount-cell"><span class="currency-symbol">E </span>${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td class="amount-cell">-</td>
                        <td>PO: ${item.poNumber}</td>
                    </tr>
                `).join('')}
                
                <tr class="total-row">
                    <td colspan="2"><strong>TOTAL ${categoryGroup.category}</strong></td>
                    <td class="amount-cell"><strong><span class="currency-symbol">E </span>${categoryGroup.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                    <td class="amount-cell">-</td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    `).join('')}
    
    <div class="grand-total">
        ALL TOTAL: <span class="currency-symbol">E </span>${summaryData.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </div>
    
    <div class="signature-section">
        <div style="text-align: center;">
            <div class="signature-line">Prepared By</div>
            <div class="signature-line">Checked By</div>
            <div class="signature-line">Approved By</div>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
            <div class="signature-line">Finance Office</div>
            <div class="signature-line">Procurement Office</div>
            <div class="signature-line">Head of Department</div>
        </div>
    </div>
    
    <div class="footer">
        <p>Generated by Caterflow Procurement System</p>
        <p>${new Date().toLocaleString()}</p>
    </div>
    
    <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="
            background: #0067FF;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px;
        ">
            Print Document
        </button>
        <button onclick="window.close()" style="
            background: #718096;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin: 5px;
        ">
            Close Window
        </button>
    </div>
</body>
</html>
        `;
	};

	// Handle tab change
	const handleTabChange = (index: number) => {
		setActiveTab(index);
	};

	// Handle refresh
	const handleRefresh = () => {
		fetchRequisitionSummary(true);
		toast({
			title: 'Refreshing',
			description: 'Fetching latest data...',
			status: 'info',
			duration: 1500,
			isClosable: true,
			position: 'top-right',
		});
	};

	// Clear filters
	const clearFilters = () => {
		setSelectedSite('all');
		setDateRange([null, null]);
		setSearchQuery('');
		toast({
			title: 'Filters Cleared',
			status: 'info',
			duration: 2000,
			isClosable: true,
			position: 'top-right',
		});
	};

	if (status === 'loading' || (loading && isInitialLoad)) {
		return (
			<Flex justifyContent="center" alignItems="center" minH="100vh" bg={bgPrimary}>
				<VStack spacing={4}>
					<Spinner size="xl" color={accentColor} thickness="4px" />
					<Text color={secondaryTextColor}>Loading requisition summary...</Text>
					<Progress size="xs" width="200px" isIndeterminate colorScheme="brand" />
				</VStack>
			</Flex>
		);
	}

	return (
		<Box p={{ base: 4, md: 6, lg: 8 }} bg={bgPrimary} minH="100vh">
			{/* Sticky Header */}
			<Box
				position="sticky"
				top={0}
				zIndex={10}
				bg={bgPrimary}
				pb={4}
				pt={2}
				mb={6}
				borderBottom="1px"
				borderColor={borderColor}
			>
				<VStack spacing={4} align="stretch">
					{/* Navigation and Title */}
					<Flex justify="space-between" align="center" wrap="wrap" gap={3}>
						<HStack spacing={3}>
							<Button
								as={Link}
								href="/operations/procurement"
								variant="ghost"
								size="sm"
								leftIcon={<Icon as={FiChevronLeft} />}
								color={secondaryTextColor}
								_hover={{ color: primaryTextColor, bg: hoverColor }}
							>
								Back
							</Button>
							<Heading as="h1" size={{ base: 'lg', md: 'xl' }} color={primaryTextColor}>
								Requisition Summary
							</Heading>
						</HStack>

						<HStack spacing={2}>
							<Tooltip label="Refresh data" placement="top">
								<IconButton
									aria-label="Refresh"
									icon={<Icon as={FiRefreshCw} />}
									size="sm"
									variant="ghost"
									onClick={handleRefresh}
									isLoading={loading && !isInitialLoad}
									color={secondaryTextColor}
									_hover={{ color: accentColor }}
								/>
							</Tooltip>

							<Button
								colorScheme="brand"
								leftIcon={<Icon as={FiPrinter} />}
								onClick={onExportModalOpen}
								isDisabled={!summary || summary.items.length === 0}
								size="sm"
							>
								{isMobile ? 'Print' : 'Generate PDF'}
							</Button>
						</HStack>
					</Flex>

					{/* Quick Stats */}
					{summary && stats && (
						<HStack spacing={3} overflowX="auto" py={2}>
							<Stat minW="150px" bg={bgCard} p={3} borderRadius="md" border="1px" borderColor={borderColor}>
								<StatLabel fontSize="xs" color={secondaryTextColor}>Total Amount</StatLabel>
								<StatNumber fontSize="lg" color={accentColor}>
									<HStack spacing={1}>
										<CurrencyIcon boxSize={4} />
										<Text>{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
									</HStack>
								</StatNumber>
								<StatHelpText fontSize="xs">
									<StatArrow type="increase" />
									{stats.itemCount} items
								</StatHelpText>
							</Stat>

							<Stat minW="150px" bg={bgCard} p={3} borderRadius="md" border="1px" borderColor={borderColor}>
								<StatLabel fontSize="xs" color={secondaryTextColor}>Items</StatLabel>
								<StatNumber fontSize="lg" color={successColor}>{stats.itemCount}</StatNumber>
								<StatHelpText fontSize="xs">Across {stats.uniqueSites} sites</StatHelpText>
							</Stat>

							<Stat minW="150px" bg={bgCard} p={3} borderRadius="md" border="1px" borderColor={borderColor}>
								<StatLabel fontSize="xs" color={secondaryTextColor}>Suppliers</StatLabel>
								<StatNumber fontSize="lg" color={warningColor}>{stats.uniqueSuppliers}</StatNumber>
								<StatHelpText fontSize="xs">Active suppliers</StatHelpText>
							</Stat>

							<Stat minW="150px" bg={bgCard} p={3} borderRadius="md" border="1px" borderColor={borderColor}>
								<StatLabel fontSize="xs" color={secondaryTextColor}>Avg/Item</StatLabel>
								<StatNumber fontSize="lg" color={secondaryTextColor}>
									<HStack spacing={1}>
										<CurrencyIcon boxSize={4} />
										<Text>{stats.averagePerItem.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
									</HStack>
								</StatNumber>
								<StatHelpText fontSize="xs">Average cost</StatHelpText>
							</Stat>
						</HStack>
					)}
				</VStack>
			</Box>

			{/* Main Content */}
			<VStack spacing={6} align="stretch">
				{/* Filters Section */}
				<Card bg={bgCard} border="1px" borderColor={borderColor} shadow="sm">
					<CardBody>
						<VStack spacing={4} align="stretch">
							<Flex justify="space-between" align="center" wrap="wrap" gap={3}>
								<Text fontWeight="semibold" color={primaryTextColor}>
									<Icon as={FiFilter} mr={2} />
									Filter Options
								</Text>

								<Button
									size="xs"
									variant="ghost"
									onClick={clearFilters}
									isDisabled={selectedSite === 'all' && !startDate && !endDate && !searchQuery}
								>
									Clear Filters
								</Button>
							</Flex>

							<HStack spacing={4} wrap="wrap" align="flex-start">
								{/* Search Input */}
								<FormControl flex="1" minW="250px">
									<FormLabel fontSize="sm" color={secondaryTextColor}>
										<Icon as={FiSearch} mr={2} />
										Search
									</FormLabel>
									<InputGroup size="sm">
										<InputLeftElement pointerEvents="none">
											<Icon as={FiSearch} color={secondaryTextColor} />
										</InputLeftElement>
										<Input
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											placeholder="Search suppliers, items, sites..."
											borderColor={borderColor}
											_focus={{ borderColor: accentColor }}
										/>
									</InputGroup>
								</FormControl>

								{/* Site Filter */}
								<FormControl maxW="200px">
									<FormLabel fontSize="sm" color={secondaryTextColor}>
										<Icon as={FiHome} mr={2} />
										Site
									</FormLabel>
									<Select
										value={selectedSite}
										onChange={(e) => setSelectedSite(e.target.value)}
										size="sm"
										borderColor={borderColor}
										bg="white"
										_dark={{ bg: 'gray.700' }}
										_focus={{ borderColor: accentColor }}
									>
										<option value="all">All Sites</option>
										{summary?.sites?.map(site => (
											<option key={site._id} value={site._id}>
												{site.name}
											</option>
										))}
									</Select>
								</FormControl>

								{/* Date Range Filter */}
								<FormControl maxW="300px">
									<FormLabel fontSize="sm" color={secondaryTextColor}>
										<Icon as={FiCalendar} mr={2} />
										Date Range
									</FormLabel>
									<Button
										onClick={onOpen}
										variant="outline"
										width="full"
										justifyContent="flex-start"
										size="sm"
										bg="white"
										_dark={{ bg: 'gray.700' }}
										borderColor={borderColor}
										_hover={{ borderColor: accentColor }}
										leftIcon={<Icon as={FiCalendar} />}
									>
										{startDate && endDate
											? `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
											: 'Select date range'}
									</Button>
								</FormControl>
							</HStack>

							{/* Active Filters Badges */}
							{(selectedSite !== 'all' || startDate || endDate || searchQuery) && (
								<HStack spacing={2} wrap="wrap">
									<Text fontSize="xs" color={secondaryTextColor}>Active filters:</Text>
									{selectedSite !== 'all' && (
										<Badge colorScheme="blue" variant="subtle">
											Site: {summary?.sites.find(s => s._id === selectedSite)?.name || selectedSite}
										</Badge>
									)}
									{startDate && (
										<Badge colorScheme="green" variant="subtle">
											From: {startDate.toLocaleDateString()}
										</Badge>
									)}
									{endDate && (
										<Badge colorScheme="green" variant="subtle">
											To: {endDate.toLocaleDateString()}
										</Badge>
									)}
									{searchQuery && (
										<Badge colorScheme="purple" variant="subtle">
											Search: "{searchQuery}"
										</Badge>
									)}
								</HStack>
							)}
						</VStack>
					</CardBody>
				</Card>

				{/* Data Display Tabs */}
				<Tabs
					variant="enclosed"
					colorScheme="brand"
					index={activeTab}
					onChange={handleTabChange}
					isLazy
					lazyBehavior="keepMounted"
				>
					<TabList>
						<Tab>
							<Icon as={FiGrid} mr={2} />
							Summary
						</Tab>
						<Tab>
							<Icon as={FiBarChart2} mr={2} />
							By Category
						</Tab>
						<Tab>
							<Icon as={FiList} mr={2} />
							Details
						</Tab>
					</TabList>

					<TabPanels>
						{/* Summary View Tab */}
						<TabPanel p={0} pt={4}>
							{loading ? (
								<VStack spacing={4} align="stretch">
									{[1, 2, 3].map(i => (
										<Skeleton key={i} height="100px" borderRadius="md" />
									))}
								</VStack>
							) : filteredItemsBySite.length > 0 ? (
								<VStack spacing={4} align="stretch">
									{filteredItemsBySite.map((siteGroup) => (
										<Card
											key={siteGroup.site._id}
											bg={bgCard}
											border="1px"
											borderColor={borderColor}
											_hover={{ transform: 'translateY(-2px)', transition: 'all 0.2s' }}
											transition="all 0.2s"
										>
											<CardBody>
												<Flex justify="space-between" align="center" mb={4}>
													<VStack align="start" spacing={1}>
														<Heading size="md" color={primaryTextColor}>
															{siteGroup.site.name}
														</Heading>
														<Text fontSize="sm" color={secondaryTextColor}>
															{siteGroup.items.length} items • {new Set(siteGroup.items.map(i => i.supplierId)).size} suppliers
														</Text>
													</VStack>
													<Badge colorScheme="blue" fontSize="md" p={2} borderRadius="md">
														<HStack spacing={1}>
															<CurrencyIcon boxSize={4} />
															<Text>{siteGroup.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
														</HStack>
													</Badge>
												</Flex>

												<TableContainer>
													<Table variant="simple" size={tableSize}>
														<Thead>
															<Tr>
																<Th>Supplier</Th>
																<Th>Item</Th>
																<Th isNumeric>Qty</Th>
																<Th isNumeric>Amount</Th>
															</Tr>
														</Thead>
														<Tbody>
															{siteGroup.items.slice(0, isMobile ? 3 : 5).map((item, index) => (
																<Tr
																	key={index}
																	_hover={{ bg: hoverColor }}
																	transition="background 0.2s"
																>
																	<Td>
																		<VStack align="start" spacing={0}>
																			<Text fontWeight="medium">{item.supplierName}</Text>
																			{item.supplierCode && (
																				<Text fontSize="xs" color={secondaryTextColor}>
																					Code: {item.supplierCode}
																				</Text>
																			)}
																		</VStack>
																	</Td>
																	<Td>
																		<VStack align="start" spacing={0}>
																			<Text fontWeight="medium">{item.itemName}</Text>
																			<Text fontSize="xs" color={secondaryTextColor}>
																				PO: {item.poNumber}
																			</Text>
																		</VStack>
																	</Td>
																	<Td isNumeric>
																		<Text>{item.quantity} {item.unitOfMeasure}</Text>
																	</Td>
																	<Td isNumeric>
																		<HStack justify="flex-end" spacing={1}>
																			<CurrencyIcon boxSize={3} />
																			<Text fontWeight="medium">{item.amount.toFixed(2)}</Text>
																		</HStack>
																		<Text fontSize="xs" color={secondaryTextColor}>
																			({item.unitPrice.toFixed(2)} each)
																		</Text>
																	</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>

												{siteGroup.items.length > (isMobile ? 3 : 5) && (
													<Flex justify="center" mt={4}>
														<Button size="sm" variant="ghost" rightIcon={<Icon as={FiChevronRight} />}>
															View all {siteGroup.items.length} items
														</Button>
													</Flex>
												)}
											</CardBody>
										</Card>
									))}
								</VStack>
							) : (
								<Card bg={bgCard} border="1px" borderColor={borderColor}>
									<CardBody>
										<VStack spacing={4} py={8} textAlign="center">
											<Icon as={FiFileText} boxSize={12} color={secondaryTextColor} opacity={0.5} />
											<Text color={secondaryTextColor}>
												No requisition data found for the selected filters
											</Text>
											<Button
												size="sm"
												variant="outline"
												onClick={clearFilters}
												leftIcon={<Icon as={FiFilter} />}
											>
												Clear filters
											</Button>
										</VStack>
									</CardBody>
								</Card>
							)}
						</TabPanel>

						{/* By Category Tab */}
						<TabPanel p={0} pt={4}>
							{loading ? (
								<VStack spacing={4} align="stretch">
									{[1, 2, 3].map(i => (
										<Skeleton key={i} height="100px" borderRadius="md" />
									))}
								</VStack>
							) : filteredItemsByCategory.length > 0 ? (
								<VStack spacing={4} align="stretch">
									{filteredItemsByCategory.map((categoryGroup) => (
										<Card
											key={categoryGroup.category}
											bg={bgCard}
											border="1px"
											borderColor={borderColor}
											_hover={{ transform: 'translateY(-2px)', transition: 'all 0.2s' }}
											transition="all 0.2s"
										>
											<CardBody>
												<Flex justify="space-between" align="center" mb={4}>
													<Heading size="md" color={primaryTextColor}>
														{categoryGroup.category}
													</Heading>
													<HStack spacing={2}>
														<Badge colorScheme="green" fontSize="md">
															{categoryGroup.items.length} items
														</Badge>
														<Badge colorScheme="blue" fontSize="md" p={2} borderRadius="md">
															<HStack spacing={1}>
																<CurrencyIcon boxSize={4} />
																<Text>{categoryGroup.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
															</HStack>
														</Badge>
													</HStack>
												</Flex>

												<TableContainer>
													<Table variant="simple" size={tableSize}>
														<Thead>
															<Tr>
																<Th>Site</Th>
																<Th>Supplier</Th>
																<Th>Item</Th>
																<Th isNumeric>Amount</Th>
															</Tr>
														</Thead>
														<Tbody>
															{categoryGroup.items.slice(0, isMobile ? 3 : 5).map((item, index) => (
																<Tr
																	key={index}
																	_hover={{ bg: hoverColor }}
																	transition="background 0.2s"
																>
																	<Td>{item.siteName}</Td>
																	<Td>{item.supplierName}</Td>
																	<Td>
																		<VStack align="start" spacing={0}>
																			<Text>{item.itemName}</Text>
																			<Text fontSize="xs" color={secondaryTextColor}>
																				{item.quantity} {item.unitOfMeasure}
																			</Text>
																		</VStack>
																	</Td>
																	<Td isNumeric>
																		<HStack justify="flex-end" spacing={1}>
																			<CurrencyIcon boxSize={3} />
																			<Text fontWeight="medium">{item.amount.toFixed(2)}</Text>
																		</HStack>
																	</Td>
																</Tr>
															))}
														</Tbody>
													</Table>
												</TableContainer>
											</CardBody>
										</Card>
									))}
								</VStack>
							) : (
								<Card bg={bgCard} border="1px" borderColor={borderColor}>
									<CardBody>
										<VStack spacing={4} py={8} textAlign="center">
											<Icon as={FiBarChart2} boxSize={12} color={secondaryTextColor} opacity={0.5} />
											<Text color={secondaryTextColor}>
												No category data found
											</Text>
										</VStack>
									</CardBody>
								</Card>
							)}
						</TabPanel>

						{/* Detailed View Tab */}
						<TabPanel p={0} pt={4}>
							{loading ? (
								<VStack spacing={2} align="stretch">
									{[1, 2, 3, 4, 5].map(i => (
										<Skeleton key={i} height="60px" borderRadius="md" />
									))}
								</VStack>
							) : filteredItems.length > 0 ? (
								<Card bg={bgCard} border="1px" borderColor={borderColor}>
									<CardBody p={0}>
										<TableContainer maxH="500px" overflowY="auto">
											<Table variant="simple" size={tableSize}>
												<Thead position="sticky" top={0} bg={bgCard} zIndex={1}>
													<Tr>
														<Th>PO Number</Th>
														<Th>Site</Th>
														<Th>Category</Th>
														<Th>Supplier</Th>
														<Th>Item</Th>
														<Th isNumeric>Qty</Th>
														<Th isNumeric>Amount</Th>
													</Tr>
												</Thead>
												<Tbody>
													{filteredItems.map((item, index) => (
														<Tr
															key={index}
															_hover={{ bg: hoverColor }}
															transition="background 0.2s"
														>
															<Td>
																<VStack align="start" spacing={0}>
																	<Text fontWeight="medium">{item.poNumber}</Text>
																	<Text fontSize="xs" color={secondaryTextColor}>
																		{new Date(item.orderDate).toLocaleDateString()}
																	</Text>
																</VStack>
															</Td>
															<Td>{item.siteName}</Td>
															<Td>
																<Badge colorScheme="purple" variant="subtle">
																	{item.category}
																</Badge>
															</Td>
															<Td>
																<VStack align="start" spacing={0}>
																	<Text>{item.supplierName}</Text>
																	{item.supplierCode && (
																		<Text fontSize="xs" color={secondaryTextColor}>
																			{item.supplierCode}
																		</Text>
																	)}
																</VStack>
															</Td>
															<Td>
																<VStack align="start" spacing={0}>
																	<Text>{item.itemName}</Text>
																	{item.itemSku && (
																		<Text fontSize="xs" color={secondaryTextColor}>
																			SKU: {item.itemSku}
																		</Text>
																	)}
																</VStack>
															</Td>
															<Td isNumeric>
																<Text>{item.quantity} {item.unitOfMeasure}</Text>
															</Td>
															<Td isNumeric>
																<HStack justify="flex-end" spacing={1}>
																	<CurrencyIcon boxSize={3} />
																	<Text fontWeight="medium">{item.amount.toFixed(2)}</Text>
																</HStack>
															</Td>
														</Tr>
													))}
												</Tbody>
											</Table>
										</TableContainer>

										<Flex justify="space-between" align="center" p={4} borderTop="1px" borderColor={borderColor}>
											<Text fontSize="sm" color={secondaryTextColor}>
												Showing {filteredItems.length} items
											</Text>
											<Text fontSize="sm" color={secondaryTextColor}>
												<HStack spacing={1} fontSize="sm" color={secondaryTextColor}>
													<CurrencyIcon boxSize={3} />
													<Text as="span" fontWeight="medium">
														{stats?.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
													</Text>
													<Text as="span">total</Text>
												</HStack>
											</Text>
										</Flex>
									</CardBody>
								</Card>
							) : (
								<Card bg={bgCard} border="1px" borderColor={borderColor}>
									<CardBody>
										<VStack spacing={4} py={8} textAlign="center">
											<Icon as={FiList} boxSize={12} color={secondaryTextColor} opacity={0.5} />
											<Text color={secondaryTextColor}>
												No detailed data found
											</Text>
										</VStack>
									</CardBody>
								</Card>
							)}
						</TabPanel>
					</TabPanels>
				</Tabs>
			</VStack>

			{/* Export Modal */}
			<Modal isOpen={isExportModalOpen} onClose={onExportModalClose} size="lg" isCentered>
				<ModalOverlay backdropFilter="blur(4px)" />
				<ModalContent bg={bgCard} border="1px" borderColor={borderColor}>
					<ModalHeader color={primaryTextColor}>
						<HStack spacing={2}>
							<Icon as={FiPrinter} />
							<Text>Generate Requisition Document</Text>
						</HStack>
					</ModalHeader>
					<ModalBody>
						<VStack spacing={4} align="stretch">
							<Alert status="info" borderRadius="md" variant="subtle">
								<AlertIcon />
								<Box>
									<AlertTitle>Finance Submission Ready</AlertTitle>
									<AlertDescription>
										Generate a printable requisition document formatted for the Finance Office.
									</AlertDescription>
								</Box>
							</Alert>

							{summary && stats && (
								<Card bg="white" _dark={{ bg: 'gray.800' }} border="1px" borderColor={borderColor}>
									<CardBody>
										<VStack spacing={3} align="stretch">
											<HStack justify="space-between">
												<Text color={secondaryTextColor}>Document Summary:</Text>
												<Badge colorScheme="blue">PDF Format</Badge>
											</HStack>
											<HStack justify="space-between">
												<Text color={secondaryTextColor}>Total Items:</Text>
												<Text fontWeight="medium">{stats.itemCount}</Text>
											</HStack>
											<HStack justify="space-between">
												<Text color={secondaryTextColor}>Total Amount:</Text>
												<HStack spacing={1}>
													<CurrencyIcon boxSize={4} />
													<Text fontWeight="medium" color={accentColor}>
														{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
													</Text>
												</HStack>
											</HStack>
											<HStack justify="space-between">
												<Text color={secondaryTextColor}>Sites Included:</Text>
												<Text fontWeight="medium">{stats.uniqueSites}</Text>
											</HStack>
											<HStack justify="space-between">
												<Text color={secondaryTextColor}>Suppliers:</Text>
												<Text fontWeight="medium">{stats.uniqueSuppliers}</Text>
											</HStack>
										</VStack>
									</CardBody>
								</Card>
							)}
						</VStack>
					</ModalBody>
					<ModalFooter>
						<HStack spacing={3} width="full">
							<Button
								variant="ghost"
								onClick={onExportModalClose}
								flex={1}
							>
								Cancel
							</Button>
							<Button
								colorScheme="brand"
								onClick={exportToPDF}
								isLoading={exporting}
								leftIcon={<Icon as={FiDownload} />}
								flex={1}
							>
								{exporting ? 'Generating...' : 'Generate PDF'}
							</Button>
						</HStack>
					</ModalFooter>
				</ModalContent>
			</Modal>

			{/* Global Styles */}
			<style jsx global>{`
                .date-picker-input {
                    width: 100%;
                    background: transparent;
                    border: none;
                    outline: none;
                    font-size: 14px;
                    color: inherit;
                    font-family: inherit;
                }
                .date-picker-input::placeholder {
                    color: var(--chakra-colors-gray-400);
                }
                .date-picker-wrapper {
                    width: 100%;
                }
                .react-datepicker__input-container {
                    width: 100%;
                }
                .react-datepicker-wrapper {
                    width: 100%;
                }
                
                /* Smooth scrolling */
                * {
                    scroll-behavior: smooth;
                }
                
                /* Better table scrolling */
                table {
                    border-collapse: separate;
                    border-spacing: 0;
                }
                
                th {
                    position: sticky;
                    top: 0;
                }
            `}</style>

			<DateRangeModal
				isOpen={isOpen}
				onClose={onClose}
				dateRange={dateRange}
				onDateRangeChange={setDateRange}
			/>
		</Box>
	);
}









interface DateRangeModalProps {
	isOpen: boolean;
	onClose: () => void;
	dateRange: [Date | null, Date | null];
	onDateRangeChange: (range: [Date | null, Date | null]) => void;
}

const DateRangeModal = ({
	isOpen,
	onClose,
	dateRange,
	onDateRangeChange,
}: DateRangeModalProps) => {
	const [tempDateRange, setTempDateRange] = useState(dateRange);
	const [startDate, endDate] = tempDateRange;

	const handleApply = () => {
		onDateRangeChange(tempDateRange);
		onClose();
	};

	const handleReset = () => {
		setTempDateRange([null, null]);
		onDateRangeChange([null, null]);
		onClose();
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="sm" isCentered>
			<ModalOverlay />
			<ModalContent>
				<ModalHeader>
					<HStack>
						<Icon as={FiCalendar} />
						<Text>Select Date Range</Text>
					</HStack>
				</ModalHeader>
				<ModalCloseButton />
				<ModalBody pb={6}>
					<VStack spacing={4}>
						<DatePicker
							selectsRange={true}
							startDate={startDate}
							endDate={endDate}
							onChange={(update: SetStateAction<[Date | null, Date | null]>) => setTempDateRange(update)}
							isClearable={false}
							inline
							monthsShown={1}
							dateFormat="dd/MM/yyyy"
							className="date-picker-modal"
						/>

						<HStack spacing={3} width="full" justify="flex-end" pt={4}>
							<Button variant="ghost" size="sm" onClick={handleReset}>
								Clear
							</Button>
							<Button
								colorScheme="brand"
								size="sm"
								onClick={handleApply}
								isDisabled={!startDate || !endDate}
							>
								Apply Dates
							</Button>
						</HStack>

						{startDate && endDate && (
							<Text fontSize="sm" color="gray.500" textAlign="center">
								Selected: {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
							</Text>
						)}
					</VStack>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}