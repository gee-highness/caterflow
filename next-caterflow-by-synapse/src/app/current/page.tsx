'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    Heading,
    Text,
    Flex,
    Spinner,
    Button,
    useToast,
    HStack,
    IconButton,
    useColorModeValue,
    Badge,
    Card,
    CardBody,
    VStack,
    InputGroup,
    InputLeftElement,
    Input,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    Progress,
    Alert,
    AlertIcon,
    AlertTitle,
    AlertDescription,
    SimpleGrid,
    Skeleton,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    MenuDivider,
    Tooltip,
    Select,
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import { FiArrowLeft, FiArrowRight, FiSearch, FiRefreshCw, FiFileText, FiInfo, FiTrendingUp, FiTrendingDown } from 'react-icons/fi';
import { MdOutlineSort } from 'react-icons/md';
import DataTable, { Column } from './DataTable';
import { Site, StockItem } from '@/lib/sanityTypes';
import { calculateBulkStock } from '@/lib/stockCalculations';

interface CurrentStockItem extends StockItem {
    currentStock: number;
    siteName: string;
    binName: string;
    minimumStockLevel: number;
    reorderQuantity: number;
    unitOfMeasure: "kg" | "g" | "l" | "ml" | "each" | "box" | "case" | "bag";
    stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock';
    lastUpdated?: string;
}

export default function CurrentStockPage() {
    const { data: session, status } = useSession();
    const user = session?.user;
    const isAuthenticated = status === 'authenticated';
    const isAuthReady = status !== 'loading';

    const [currentStockItems, setCurrentStockItems] = useState<CurrentStockItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<CurrentStockItem[]>([]);
    const [sites, setSites] = useState<Site[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState(0);
    const [progress, setProgress] = useState({ stage: 'Starting...', percentage: 0 });
    const [calculationMetrics, setCalculationMetrics] = useState<{
        duration: number;
        itemsProcessed: number;
        fromCache: number;
    } | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'name',
        direction: 'asc'
    });
    const toast = useToast();
    const sitesContainerRef = useRef<HTMLDivElement>(null);

    // Theming props
    const bgPrimary = useColorModeValue('neutral.light.bg-primary', 'neutral.dark.bg-primary');
    const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const borderCard = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const successColor = useColorModeValue('green.500', 'green.300');
    const warningColor = useColorModeValue('orange.500', 'orange.300');
    const errorColor = useColorModeValue('red.500', 'red.300');

    // Calculate stock with progress tracking
    const calculateStockForSite = useCallback(async (siteId: string | null) => {
        setIsLoading(true);
        setIsRefreshing(true);
        setError(null);
        setProgress({ stage: 'Starting calculation...', percentage: 0 });
        setCalculationMetrics(null);

        const startTime = Date.now();

        try {
            console.log('🔄 Starting stock calculation for site:', siteId || 'All sites');

            // Fetch all stock items (no site filtering)
            setProgress({ stage: 'Fetching stock items...', percentage: 10 });
            console.log('📦 Fetching all stock items...');
            const stockItemsResponse = await fetch('/api/stock-items');
            if (!stockItemsResponse.ok) {
                throw new Error('Failed to fetch stock items');
            }
            const stockItems: any[] = await stockItemsResponse.json();
            console.log('✅ Stock items fetched:', stockItems.length, 'items');

            if (stockItems.length === 0) {
                console.log('⚠️ No stock items found');
                setCurrentStockItems([]);
                setIsLoading(false);
                setIsRefreshing(false);
                return;
            }

            // Fetch bins for the selected site (or all bins if no site selected)
            setProgress({ stage: 'Fetching bins...', percentage: 20 });
            const binsEndpoint = siteId ? `/api/bins?siteId=${siteId}` : '/api/bins';
            console.log('🗄️ Fetching bins from:', binsEndpoint);
            const binsResponse = await fetch(binsEndpoint);
            if (!binsResponse.ok) {
                throw new Error('Failed to fetch bins');
            }
            const bins = await binsResponse.json();
            const binIds = bins.map((bin: any) => bin._id);
            console.log('✅ Bins fetched:', bins.length, 'bins, IDs:', binIds);

            if (binIds.length === 0) {
                console.log('⚠️ No bins found for site:', siteId);
                setCurrentStockItems([]);
                setIsLoading(false);
                setIsRefreshing(false);
                return;
            }

            // Get all stock item IDs
            const stockItemIds = stockItems.map(item => item._id);
            console.log('🔢 Calculating stock for', stockItemIds.length, 'items across', binIds.length, 'bins');

            // Calculate current stock for all items in all bins with progress tracking
            setProgress({ stage: 'Calculating current stock...', percentage: 30 });
            console.log('🧮 Starting bulk stock calculation...');

            const stockResults = await calculateBulkStock(stockItemIds, binIds, (progressUpdate) => {
                setProgress(progressUpdate);
            });

            console.log('✅ Bulk stock calculation complete. Results:', Object.keys(stockResults).length, 'item-bin pairs');

            // Process results and create a separate entry for each item-bin combination with stock
            setProgress({ stage: 'Processing results...', percentage: 80 });
            console.log('📊 Processing results and creating individual entries for each bin...');
            const itemsWithCalculatedStock: CurrentStockItem[] = [];

            stockItems.forEach(item => {
                let foundStock = false;

                // Find all bins that contain this item
                const itemBins = bins.filter((bin: any) => {
                    const key = `${item._id}-${bin._id}`;
                    const quantity = stockResults[key] || 0;
                    if (quantity > 0) {
                        foundStock = true;
                        return true;
                    }
                    return false;
                });

                if (foundStock) {
                    // Create a separate entry for each bin that has stock
                    itemBins.forEach((bin: any) => {
                        const quantity = stockResults[`${item._id}-${bin._id}`];
                        let stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock' = 'in-stock';
                        if (quantity <= item.minimumStockLevel) {
                            stockStatus = 'low-stock';
                        }
                        if (quantity === 0) {
                            stockStatus = 'out-of-stock';
                        }

                        itemsWithCalculatedStock.push({
                            ...item,
                            currentStock: quantity,
                            stockStatus,
                            siteName: bin.site?.name || "Unknown site",
                            binName: bin.name,
                            lastUpdated: new Date().toISOString(),
                        });
                    });
                }
            });

            const duration = Date.now() - startTime;
            setCalculationMetrics({
                duration,
                itemsProcessed: itemsWithCalculatedStock.length,
                fromCache: 0
            });

            console.log('✅ Stock calculation complete. Total items to display:', itemsWithCalculatedStock.length);
            setCurrentStockItems(itemsWithCalculatedStock);

            // Show success toast with metrics
            toast({
                title: 'Stock calculation complete',
                description: `Calculated ${itemsWithCalculatedStock.length} stock items in ${duration}ms`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

        } catch (err: any) {
            console.error('❌ Error calculating stock:', err);
            setError(err.message);
            toast({
                title: 'Error',
                description: 'Failed to calculate current stock',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setProgress({ stage: 'Complete', percentage: 100 });
            setIsLoading(false);
            setIsRefreshing(false);
            console.log('🏁 Stock calculation finished');
        }
    }, [toast]);

    const fetchSites = async () => {
        try {
            console.log('🌐 Fetching sites...');
            const response = await fetch('/api/sites');
            if (!response.ok) {
                throw new Error('Failed to fetch sites');
            }
            const data = await response.json();
            console.log('✅ Sites fetched:', data.length, 'sites');
            setSites(data);
        } catch (err) {
            console.error('❌ Failed to fetch sites:', err);
        }
    };

    const handleSiteClick = (siteId: string) => {
        console.log('📍 Site selected:', siteId);
        setSelectedSiteId(siteId);
    };

    const handleRefresh = () => {
        console.log('🔄 Manual refresh triggered');
        setIsRefreshing(true);
        calculateStockForSite(selectedSiteId);
    };

    useEffect(() => {
        // Fetch sites immediately upon authentication
        if (isAuthReady && isAuthenticated && sites.length === 0) {
            fetchSites();
        }
        // Set associated site for site managers
        if (user?.associatedSite?._id) {
            setSelectedSiteId(user.associatedSite._id);
        }
        // Set default site for admins/auditors only if no site is selected and sites are available
        if ((user?.role === 'admin' || user?.role === 'auditor' || user?.role === 'procurer') && sites.length > 0 && !selectedSiteId) {
            setSelectedSiteId(sites[0]._id);
        }
    }, [isAuthReady, isAuthenticated, sites, user, selectedSiteId]);

    // Calculate stock when site selection changes
    useEffect(() => {
        if (isAuthReady && isAuthenticated) {
            calculateStockForSite(selectedSiteId);
        }
    }, [selectedSiteId, isAuthReady, isAuthenticated, calculateStockForSite]);

    // Filter items based on search term and active tab
    useEffect(() => {
        let filtered = currentStockItems.filter(item => {
            if (!searchTerm) return true;

            const term = searchTerm.toLowerCase();
            return (
                item.name.toLowerCase().includes(term) ||
                item.sku.toLowerCase().includes(term) ||
                item.binName.toLowerCase().includes(term) ||
                item.siteName.toLowerCase().includes(term)
            );
        });

        // Apply tab filter
        switch (activeTab) {
            case 1: // In Stock
                filtered = filtered.filter(item => item.stockStatus === 'in-stock');
                break;
            case 2: // Low Stock
                filtered = filtered.filter(item => item.stockStatus === 'low-stock');
                break;
            case 3: // Out of Stock
                filtered = filtered.filter(item => item.stockStatus === 'out-of-stock');
                break;
            default: // All
                break;
        }

        // Apply sorting
        filtered.sort((a, b) => {
            const aValue = a[sortConfig.key as keyof CurrentStockItem];
            const bValue = b[sortConfig.key as keyof CurrentStockItem];

            // Convert to strings for safe comparison
            const aStr = String(aValue || '');
            const bStr = String(bValue || '');

            if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        setFilteredItems(filtered);
    }, [currentStockItems, searchTerm, activeTab, sortConfig]);

    const handleScroll = (direction: 'left' | 'right') => {
        if (sitesContainerRef.current) {
            const scrollAmount = 200;
            const container = sitesContainerRef.current;
            if (direction === 'left') {
                container.scrollLeft -= scrollAmount;
            } else {
                container.scrollLeft += scrollAmount;
            }
        }
    };

    const getStockStatusColor = (currentStock: number, minimumStockLevel: number) => {
        if (currentStock === 0) return 'red';
        if (currentStock <= minimumStockLevel) return 'orange';
        return 'green';
    };

    const getStockStatusText = (currentStock: number, minimumStockLevel: number) => {
        if (currentStock === 0) return 'Out of Stock';
        if (currentStock <= minimumStockLevel) return 'Low Stock';
        return 'In Stock';
    };

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const columns: Column[] = [
        {
            accessorKey: 'name',
            header: (
                <Flex align="center" cursor="pointer" onClick={() => handleSort('name')}>
                    Item Name
                    {sortConfig.key === 'name' && (
                        <Text ml={2} fontSize="sm">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </Text>
                    )}
                </Flex>
            ),
            isSortable: true,
        },
        {
            accessorKey: 'sku',
            header: (
                <Flex align="center" cursor="pointer" onClick={() => handleSort('sku')}>
                    SKU
                    {sortConfig.key === 'sku' && (
                        <Text ml={2} fontSize="sm">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </Text>
                    )}
                </Flex>
            ),
            isSortable: true,
        },
        {
            accessorKey: 'currentStock',
            header: (
                <Flex align="center" cursor="pointer" onClick={() => handleSort('currentStock')}>
                    Current Stock
                    {sortConfig.key === 'currentStock' && (
                        <Text ml={2} fontSize="sm">
                            {sortConfig.direction === 'asc' ? '↑' : '↓'}
                        </Text>
                    )}
                </Flex>
            ),
            isSortable: true,
            cell: (row: CurrentStockItem) => (
                <Flex align="center" gap={2}>
                    <Badge
                        colorScheme={getStockStatusColor(row.currentStock, row.minimumStockLevel)}
                        mr={2}
                        px={2}
                        py={1}
                    >
                        {getStockStatusText(row.currentStock, row.minimumStockLevel)}
                    </Badge>
                    <Flex direction="column">
                        <Text fontWeight="bold">{row.currentStock}</Text>
                        <Text fontSize="xs" color={secondaryTextColor}>
                            min: {row.minimumStockLevel}
                        </Text>
                    </Flex>
                </Flex>
            ),
        },
        {
            accessorKey: 'minimumStockLevel',
            header: 'Min Level',
            isSortable: true,
        },
        {
            accessorKey: 'unitOfMeasure',
            header: 'Unit',
            isSortable: true,
        },
        {
            accessorKey: 'binName',
            header: 'Bin Location',
            isSortable: true,
        },
        {
            accessorKey: 'siteName',
            header: 'Site',
            isSortable: true,
        },
    ];

    const exportCurrentStockPDF = () => {
        const sortedItems = [...filteredItems].sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Current Stock Report</title>
    <style>
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
            margin: 40px; 
            color: #151515;
            background: #F5F7FA;
        }
        .header-container {
            display: flex;
            align-items: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #E2E8F0;
            padding-bottom: 20px;
            gap: 20px;
        }
        .logo {
            height: 80px;
            width: auto;
            opacity: 0.8;
        }
        .header-content {
            text-align: left;
            flex-grow: 1;
        }
        .header-content h1 { 
            margin: 0; 
            color: #0067FF;
            font-size: 28px;
            font-weight: 600;
        }
        .status-in-stock { background-color: #C6F6D5; color: #22543D; }
        .status-low-stock { background-color: #FEEBC8; color: #744210; }
        .status-out-of-stock { background-color: #FED7D7; color: #742A2A; }
        .table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: #FFFFFF;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
            border: 1px solid #E2E8F0;
        }
        .table th {
            background-color: #F7FAFC;
            border: 1px solid #E2E8F0;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            color: #2D3748;
            font-size: 14px;
        }
        .table td {
            border: 1px solid #E2E8F0;
            padding: 12px 16px;
            color: #4A5568;
            font-size: 14px;
        }
        .table tr:nth-child(even) {
            background-color: #F7FAFC;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #E2E8F0;
            font-size: 12px;
            color: #718096;
            text-align: center;
        }
        .status-badge {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
        }
        @media print {
            body { margin: 25px; background: white; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header-container">
        <div class="logo-container">
            <img src="/pdf.png" alt="Caterflow" class="logo" />
        </div>
        <div class="header-content">
            <h1>CURRENT STOCK REPORT</h1>
            <p style="font-size: 14px; margin: 5px 0;">Generated on ${new Date().toLocaleDateString()}</p>
            <p style="font-size: 14px; margin: 5px 0;">Total Items: ${sortedItems.length}</p>
            <p style="font-size: 14px; margin: 5px 0;">Site: ${selectedSiteId ? sites.find(s => s._id === selectedSiteId)?.name || 'All Sites' : 'All Sites'}</p>
        </div>
    </div>

    <table class="table">
        <thead>
            <tr>
                <th>Item Name</th>
                <th>SKU</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th>Unit of Measure</th>
                <th>Bin Location</th>
                <th>Site</th>
            </tr>
        </thead>
        <tbody>
            ${sortedItems.map(item => {
            const statusClass = `status-${item.stockStatus.replace('-', '-')}`;
            const statusText = item.stockStatus === 'in-stock' ? 'In Stock' :
                item.stockStatus === 'low-stock' ? 'Low Stock' : 'Out of Stock';
            return `
                <tr>
                    <td><strong>${item.name}</strong></td>
                    <td>${item.sku || 'N/A'}</td>
                    <td>${item.currentStock}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${item.unitOfMeasure}</td>
                    <td>${item.binName}</td>
                    <td>${item.siteName}</td>
                </tr>
                `;
        }).join('')}
        </tbody>
    </table>

    <div class="footer">
        <p style="margin: 0 0 8px 0;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        <p style="margin: 0 0 8px 0;">This report provides an overview of current stock levels across all sites.</p>
        <div class="caterflow-brand">
            <a href="https://synapse-digital.vercel.app/" target="_blank" style="color: #0067FF; text-decoration: none; cursor: pointer;">
                Caterflow by Synapse
            </a>
        </div>
    </div>

    <div class="no-print" style="text-align: center; margin-top: 20px;">
        <button onclick="window.print()" style="background: #0067FF; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
            Print / Save as PDF
        </button>
    </div>
</body>
</html>`;

        const exportWindow = window.open('', '_blank');
        if (exportWindow) {
            exportWindow.document.write(htmlContent);
            exportWindow.document.close();
            exportWindow.document.title = 'Current Stock Report';
        }
    };

    if (status === 'loading') {
        return (
            <Flex justifyContent="center" alignItems="center" minH="100vh" bg={bgPrimary}>
                <VStack spacing={4}>
                    <Spinner size="xl" color="brand.500" />
                    <Text color={primaryTextColor}>Loading session...</Text>
                </VStack>
            </Flex>
        );
    }

    return (
        <Box p={{ base: 4, md: 8 }} bg={bgPrimary} minH="100vh">
            <VStack spacing={6} align="stretch">
                {/* Header with Stats */}
                <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexWrap="wrap" gap={4} direction={{ base: 'column', md: 'row' }}>
                    <VStack align="flex-start" spacing={1}>
                        <Heading as="h1" size={{ base: 'xl', md: '2xl' }} color={primaryTextColor}>
                            Current Stock
                        </Heading>
                        {!isLoading && calculationMetrics && (
                            <Text fontSize="sm" color={secondaryTextColor}>
                                Calculated in {calculationMetrics.duration}ms • {calculationMetrics.itemsProcessed} items
                            </Text>
                        )}
                    </VStack>
                    <HStack>
                        <Menu>
                            <MenuButton as={Button} leftIcon={<MdOutlineSort />} variant="outline" size="sm">
                                Sort
                            </MenuButton>
                            <MenuList>
                                <MenuItem onClick={() => handleSort('name')}>
                                    Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </MenuItem>
                                <MenuItem onClick={() => handleSort('currentStock')}>
                                    Stock Level {sortConfig.key === 'currentStock' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </MenuItem>
                                <MenuItem onClick={() => handleSort('minimumStockLevel')}>
                                    Min Level {sortConfig.key === 'minimumStockLevel' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                </MenuItem>
                                <MenuDivider />
                                <MenuItem onClick={() => setSortConfig({ key: 'name', direction: 'asc' })}>
                                    Reset Sorting
                                </MenuItem>
                            </MenuList>
                        </Menu>
                        <Button
                            leftIcon={<FiRefreshCw />}
                            onClick={handleRefresh}
                            isLoading={isRefreshing}
                            variant="outline"
                            colorScheme="brand"
                            size="sm"
                        >
                            Refresh
                        </Button>
                        <Button
                            leftIcon={<FiFileText />}
                            onClick={exportCurrentStockPDF}
                            variant="outline"
                            colorScheme="brand"
                            size="sm"
                            isDisabled={isLoading || isRefreshing}
                        >
                            Export PDF
                        </Button>
                    </HStack>
                </Flex>

                {/* Progress Bar during Calculation */}
                {(isLoading || isRefreshing) && progress && (
                    <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                        <CardBody>
                            <VStack spacing={3} align="stretch">
                                <Text fontWeight="medium" color={primaryTextColor}>
                                    {progress.stage}
                                </Text>
                                <Progress
                                    value={progress.percentage}
                                    colorScheme="brand"
                                    hasStripe
                                    isAnimated={progress.percentage < 100}
                                />
                                <Text fontSize="sm" color={secondaryTextColor} textAlign="right">
                                    {progress.percentage}%
                                </Text>
                            </VStack>
                        </CardBody>
                    </Card>
                )}

                {/* Search Input */}
                <InputGroup>
                    <InputLeftElement pointerEvents="none">
                        <FiSearch color={secondaryTextColor} />
                    </InputLeftElement>
                    <Input
                        placeholder="Search by item name, SKU, bin, or site..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        borderColor={borderCard}
                        _placeholder={{ color: secondaryTextColor }}
                        size="lg"
                    />
                </InputGroup>

                {/* Alert for Low Stock Items */}
                {!isLoading && currentStockItems.some(item => item.stockStatus === 'low-stock') && (
                    <Alert status="warning" borderRadius="md" variant="left-accent">
                        <AlertIcon />
                        <Box flex="1">
                            <AlertTitle>Low Stock Items Detected</AlertTitle>
                            <AlertDescription>
                                {currentStockItems.filter(item => item.stockStatus === 'low-stock').length} items are below minimum stock levels
                            </AlertDescription>
                        </Box>
                    </Alert>
                )}

                {/* Sites Section */}
                {(user?.role === 'admin' || user?.role === 'auditor' || user?.role === 'procurer') && (
                    <>
                        <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
                            <Heading as="h2" size="md" color={primaryTextColor}>Sites</Heading>
                            {sites.length > 3 && (
                                <HStack>
                                    <IconButton
                                        aria-label="Scroll left"
                                        icon={<FiArrowLeft />}
                                        onClick={() => handleScroll('left')}
                                        size="sm"
                                        variant="ghost"
                                        colorScheme="brand"
                                    />
                                    <IconButton
                                        aria-label="Scroll right"
                                        icon={<FiArrowRight />}
                                        onClick={() => handleScroll('right')}
                                        size="sm"
                                        variant="ghost"
                                        colorScheme="brand"
                                    />
                                </HStack>
                            )}
                        </Flex>

                        {isLoading ? (
                            <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} spacing={3}>
                                {[...Array(6)].map((_, i) => (
                                    <Skeleton key={i} height="40px" borderRadius="md" />
                                ))}
                            </SimpleGrid>
                        ) : sites.length > 0 ? (
                            <Flex
                                ref={sitesContainerRef}
                                overflowX="auto"
                                whiteSpace="nowrap"
                                pb={2}
                                sx={{
                                    '::-webkit-scrollbar': { display: 'none' },
                                    msOverflowStyle: 'none',
                                    scrollbarWidth: 'none',
                                }}
                            >
                                <Button
                                    key="all"
                                    onClick={() => setSelectedSiteId(null)}
                                    mr={2}
                                    variant={selectedSiteId === null ? 'solid' : 'outline'}
                                    colorScheme="brand"
                                    minW="100px"
                                >
                                    All Sites
                                </Button>
                                {sites.map(site => (
                                    <Button
                                        key={site._id}
                                        onClick={() => handleSiteClick(site._id)}
                                        mr={2}
                                        variant={selectedSiteId === site._id ? 'solid' : 'outline'}
                                        colorScheme="brand"
                                        minW="120px"
                                    >
                                        {site.name}
                                    </Button>
                                ))}
                            </Flex>
                        ) : (
                            <Text color={secondaryTextColor}>No sites found for your account.</Text>
                        )}
                    </>
                )}

                {/* For site managers, show their associated site */}
                {user?.role === 'siteManager' && user.associatedSite && (
                    <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                        <CardBody>
                            <Text fontWeight="bold" color={primaryTextColor}>Your Associated Site:</Text>
                            <Text color={secondaryTextColor}>{user.associatedSite.name}</Text>
                        </CardBody>
                    </Card>
                )}

                {/* Stock Summary Cards */}
                {!isLoading && currentStockItems.length > 0 && (
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
                        <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                            <CardBody>
                                <VStack spacing={1}>
                                    <Badge colorScheme="green" borderRadius="full" px={3} py={1}>
                                        <FiTrendingUp />
                                    </Badge>
                                    <Text fontSize="2xl" fontWeight="bold">
                                        {currentStockItems.filter(item => item.stockStatus === 'in-stock').length}
                                    </Text>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        In Stock
                                    </Text>
                                </VStack>
                            </CardBody>
                        </Card>
                        <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                            <CardBody>
                                <VStack spacing={1}>
                                    <Badge colorScheme="orange" borderRadius="full" px={3} py={1}>
                                        <FiInfo />
                                    </Badge>
                                    <Text fontSize="2xl" fontWeight="bold">
                                        {currentStockItems.filter(item => item.stockStatus === 'low-stock').length}
                                    </Text>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        Low Stock
                                    </Text>
                                </VStack>
                            </CardBody>
                        </Card>
                        <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                            <CardBody>
                                <VStack spacing={1}>
                                    <Badge colorScheme="red" borderRadius="full" px={3} py={1}>
                                        <FiTrendingDown />
                                    </Badge>
                                    <Text fontSize="2xl" fontWeight="bold">
                                        {currentStockItems.filter(item => item.stockStatus === 'out-of-stock').length}
                                    </Text>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        Out of Stock
                                    </Text>
                                </VStack>
                            </CardBody>
                        </Card>
                        <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                            <CardBody>
                                <VStack spacing={1}>
                                    <Badge colorScheme="blue" borderRadius="full" px={3} py={1}>
                                        Total
                                    </Badge>
                                    <Text fontSize="2xl" fontWeight="bold">
                                        {currentStockItems.length}
                                    </Text>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        Total Items
                                    </Text>
                                </VStack>
                            </CardBody>
                        </Card>
                    </SimpleGrid>
                )}

                {/* Filter Tabs */}
                <Tabs index={activeTab} onChange={setActiveTab} variant="enclosed" colorScheme="brand">
                    <TabList>
                        <Tab>
                            All ({currentStockItems.length})
                        </Tab>
                        <Tab>
                            <HStack>
                                <FiTrendingUp />
                                <Text>In Stock</Text>
                                <Badge colorScheme="green" borderRadius="full">
                                    {currentStockItems.filter(item => item.stockStatus === 'in-stock').length}
                                </Badge>
                            </HStack>
                        </Tab>
                        <Tab>
                            <HStack>
                                <FiInfo />
                                <Text>Low Stock</Text>
                                <Badge colorScheme="orange" borderRadius="full">
                                    {currentStockItems.filter(item => item.stockStatus === 'low-stock').length}
                                </Badge>
                            </HStack>
                        </Tab>
                        <Tab>
                            <HStack>
                                <FiTrendingDown />
                                <Text>Out of Stock</Text>
                                <Badge colorScheme="red" borderRadius="full">
                                    {currentStockItems.filter(item => item.stockStatus === 'out-of-stock').length}
                                </Badge>
                            </HStack>
                        </Tab>
                    </TabList>
                    <TabPanels>
                        <TabPanel p={0} pt={4}>
                            {/* All items */}
                        </TabPanel>
                        <TabPanel p={0} pt={4}>
                            {/* In Stock items */}
                        </TabPanel>
                        <TabPanel p={0} pt={4}>
                            {/* Low Stock items */}
                        </TabPanel>
                        <TabPanel p={0} pt={4}>
                            {/* Out of Stock items */}
                        </TabPanel>
                    </TabPanels>
                </Tabs>

                {/* Data Table */}
                {error ? (
                    <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                        <CardBody>
                            <VStack spacing={4}>
                                <Alert status="error" borderRadius="md">
                                    <AlertIcon />
                                    <Box>
                                        <AlertTitle>Error Loading Data</AlertTitle>
                                        <AlertDescription>{error}</AlertDescription>
                                    </Box>
                                </Alert>
                                <Button
                                    onClick={() => calculateStockForSite(selectedSiteId)}
                                    colorScheme="brand"
                                    isLoading={isLoading}
                                >
                                    Try Again
                                </Button>
                            </VStack>
                        </CardBody>
                    </Card>
                ) : isLoading && !isRefreshing ? (
                    <VStack spacing={4} py={8}>
                        <Spinner size="xl" color="brand.500" />
                        <Text color={secondaryTextColor}>Loading stock data...</Text>
                    </VStack>
                ) : filteredItems.length === 0 ? (
                    <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                        <CardBody>
                            <VStack spacing={4} py={8}>
                                <FiInfo size={48} color={secondaryTextColor} />
                                <Text fontSize="lg" color={secondaryTextColor} textAlign="center">
                                    {searchTerm ?
                                        `No items found matching "${searchTerm}"` :
                                        activeTab > 0 ?
                                            'No items match the selected filter' :
                                            selectedSiteId ?
                                                "No stock items found for this site." :
                                                "No stock items found for your account."
                                    }
                                </Text>
                                {searchTerm && (
                                    <Button
                                        onClick={() => setSearchTerm('')}
                                        variant="ghost"
                                        size="sm"
                                    >
                                        Clear Search
                                    </Button>
                                )}
                                {activeTab > 0 && (
                                    <Button
                                        onClick={() => setActiveTab(0)}
                                        variant="ghost"
                                        size="sm"
                                    >
                                        Show All Items
                                    </Button>
                                )}
                            </VStack>
                        </CardBody>
                    </Card>
                ) : (
                    <Card bg={bgCard} borderColor={borderCard} borderWidth="1px">
                        <CardBody p={0}>
                            <DataTable
                                columns={columns}
                                data={filteredItems}
                                loading={isLoading}
                            />
                        </CardBody>
                    </Card>
                )}

                {/* Performance Metrics (Debug) */}
                {!isLoading && calculationMetrics && process.env.NODE_ENV === 'development' && (
                    <Card bg={bgCard} borderColor={borderCard} borderWidth="1px" size="sm">
                        <CardBody>
                            <Text fontSize="xs" color={secondaryTextColor}>
                                Performance: {calculationMetrics.duration}ms •
                                Items: {calculationMetrics.itemsProcessed} •
                                Cache: {calculationMetrics.fromCache}
                            </Text>
                        </CardBody>
                    </Card>
                )}
            </VStack>
        </Box>
    );
}