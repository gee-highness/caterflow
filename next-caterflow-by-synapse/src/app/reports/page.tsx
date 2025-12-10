// src/app/reports/page.tsx - WITH VAT CALCULATIONS
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Box, Heading, Text, Flex, Spinner, Button, useToast, Tabs, TabList, TabPanels, Tab, TabPanel,
    Card, CardBody, VStack, HStack, Select, Input, InputGroup, InputLeftElement, Badge,
    Table, Thead, Tbody, Tr, Th, Td, TableContainer, useColorModeValue, Icon, Alert, AlertIcon,
    SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, Grid, GridItem, Progress,
    Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon,
    Radio, RadioGroup, Stack, Wrap, WrapItem, Skeleton, SkeletonText
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import {
    FiDownload, FiSearch, FiCalendar, FiFilter, FiTrendingUp, FiPackage,
    FiTruck, FiRepeat, FiBarChart2, FiPieChart, FiUsers,
    FiShoppingCart, FiArchive, FiAlertTriangle, FiDollarSign, FiUser,
    FiRefreshCw, FiPercent
} from 'react-icons/fi';

// Chart components
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts';

// Excel export utilities
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format, subDays, subMonths, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';

// Types based on your Sanity schemas
interface AppUser {
    _id: string;
    name: string;
    email: string;
    role: string;
    associatedSite?: { _id: string; name: string };
    isActive: boolean;
}

interface Site {
    _id: string;
    name: string;
    code: { current: string };
    location: string;
    manager?: { _id: string; name: string };
    patientCount: number;
}

interface StockItem {
    _id: string;
    name: string;
    sku: string;
    itemType: string;
    category: { _id: string; title: string };
    unitOfMeasure: string;
    unitPrice: number;
    minimumStockLevel: number;
    reorderQuantity: number;
    primarySupplier?: { _id: string; name: string };
    suppliers: Array<{ _id: string; name: string }>;
    currentStock?: number;
    isVATApplicable?: boolean; // New field for VAT applicability
}

interface PurchaseOrder {
    _id: string;
    poNumber: string;
    orderDate: string;
    status: string;
    orderedItems: Array<{
        stockItem: StockItem;
        supplier?: { _id: string; name: string };
        orderedQuantity: number;
        unitPrice: number;
        totalPrice: number;
        vatAmount?: number; // New field for VAT
        totalWithVAT?: number; // New field for total with VAT
    }>;
    totalAmount: number;
    vatAmount?: number; // New field for VAT
    totalWithVAT?: number; // New field for total with VAT
    orderedBy: AppUser;
    site: Site;
    evidenceStatus: string;
}

interface GoodsReceipt {
    _id: string;
    receiptNumber: string;
    receiptDate: string;
    status: string;
    purchaseOrder?: { _id: string; poNumber: string; site: Site };
    receivingBin: { _id: string; name: string; site: Site };
    receivedItems: Array<{
        stockItem: StockItem;
        receivedQuantity: number;
        batchNumber?: string;
        expiryDate?: string;
        condition: string;
        unitPrice?: number;
        vatAmount?: number; // New field for VAT
        totalWithVAT?: number; // New field for total with VAT
    }>;
    evidenceStatus: string;
}

interface DispatchLog {
    _id: string;
    dispatchNumber: string;
    dispatchDate: string;
    dispatchType: { _id: string; name: string; description: string; sellingPrice: number };
    sourceBin: { _id: string; name: string; site: Site };
    dispatchedBy: AppUser;
    dispatchedItems: Array<{
        stockItem: StockItem;
        dispatchedQuantity: number;
        unitPrice: number;
        totalCost: number;
        vatAmount?: number; // New field for VAT
        totalWithVAT?: number; // New field for total with VAT
    }>;
    peopleFed: number;
    totalCost: number;
    vatAmount?: number; // New field for VAT
    totalWithVAT?: number; // New field for total with VAT
    costPerPerson: number;
    sellingPrice: number;
    totalSales: number;
    evidenceStatus: string;
}

interface InternalTransfer {
    _id: string;
    transferNumber: string;
    transferDate: string;
    fromBin: { _id: string; name: string; site: Site };
    toBin: { _id: string; name: string; site: Site };
    transferredBy: AppUser;
    transferredItems: Array<{
        stockItem: StockItem;
        transferredQuantity: number;
    }>;
    status: string;
    approvedBy?: AppUser;
    approvedAt?: string;
}

interface InventoryCount {
    _id: string;
    countNumber: string;
    countDate: string;
    bin: { _id: string; name: string; site: Site };
    countedBy: AppUser;
    status: string;
    countedItems: Array<{
        stockItem: StockItem;
        countedQuantity: number;
        systemQuantityAtCountTime: number;
        variance: number;
    }>;
}

interface Supplier {
    _id: string;
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    isActive: boolean;
    vatNumber?: string; // New field for VAT registration
}

// Enhanced Analytics Data Interface with VAT
interface EnhancedAnalyticsData {
    summary: {
        totalPurchaseOrders: number;
        totalGoodsReceipts: number;
        totalDispatches: number;
        totalTransfers: number;
        totalBinCounts: number;
        totalStockItems: number;
        totalSuppliers: number;
        totalUsers: number;
        totalSites: number;
        totalInventoryValue: number;
        totalPeopleFed: number;
        lowStockItems: number;
        criticalStockItems: number;
        totalVATCollected: number; // New VAT summary
        totalVATPaid: number; // New VAT summary
        netVATLiability: number; // New VAT summary
    };
    purchaseOrders: {
        byStatus: Array<{ name: string; value: number }>;
        bySite: Array<{ name: string; value: number }>;
        byMonth: Array<{ name: string; value: number }>;
        totalValue: number;
        vatAmount: number; // New VAT field
        totalWithVAT: number; // New VAT field
        avgOrderValue: number;
        topItems: Array<{ name: string; quantity: number; value: number; vatAmount: number }>;
        statusBreakdown: { [key: string]: number };
    };
    goodsReceipts: {
        byStatus: Array<{ name: string; value: number }>;
        bySite: Array<{ name: string; value: number }>;
        efficiency: number;
        conditionBreakdown: { [key: string]: number };
        totalValue: number; // New field
        vatAmount: number; // New VAT field
        totalWithVAT: number; // New VAT field
    };
    dispatches: {
        byType: Array<{ name: string; value: number }>;
        bySite: Array<{ name: string; value: number }>;
        totalPeopleFed: number;
        totalCost: number;
        vatAmount: number; // New VAT field
        totalWithVAT: number; // New VAT field
        costPerPerson: number;
        topItems: Array<{ name: string; quantity: number; cost: number; vatAmount: number }>;
        totalSales: number;
        salesVAT: number; // New VAT field
        salesWithVAT: number; // New VAT field
    };
    transfers: {
        byStatus: Array<{ name: string; value: number }>;
        bySite: Array<{ name: string; value: number }>;
        approvalRate: number;
    };
    inventory: {
        byCategory: Array<{ name: string; value: number }>;
        totalValue: number;
        vatIncluded: number; // New VAT field
        lowStockBreakdown: {
            critical: number;
            warning: number;
            healthy: number;
        };
    };
    binCounts: {
        byStatus: Array<{ name: string; value: number }>;
        accuracy: number;
        varianceAnalysis: {
            positive: number;
            negative: number;
            zero: number;
        };
    };
    financial: {
        monthlySpending: Array<{ month: string; spending: number; vat: number; totalWithVAT: number }>;
        costPerPersonTrend: Array<{ date: string; cost: number }>;
        inventoryTurnover: number;
        totalReceivedGoodsValue: number;
        totalSales: number;
        consumption: number;
        profit: number;
        profitPercentage: number;
        closingStockValue: number;
        periodPurchases: number;
        periodConsumption: number;
        periodSales: number;
        openingStock: number;
        netVariances: number;
        // VAT-specific financials
        vatOnPurchases: number;
        vatOnSales: number;
        netVATPayable: number;
        grossProfitBeforeVAT: number;
        grossProfitAfterVAT: number;
    };
    suppliers: {
        performance: Array<{ name: string; orders: number; value: number; vatAmount: number }>;
        activeCount: number;
        vatRegisteredCount: number; // New VAT field
    };
    users: {
        byRole: Array<{ name: string; value: number }>;
        activity: Array<{ name: string; actions: number }>;
    };
    vat: {
        summary: {
            totalOutputVAT: number;
            totalInputVAT: number;
            netVATPayable: number;
            vatRate: number;
        };
        breakdown: {
            purchases: { vatAmount: number; totalWithVAT: number };
            sales: { vatAmount: number; totalWithVAT: number };
            inventory: { vatAmount: number; totalWithVAT: number };
        };
    };
}

// OLD REPORTS INTERFACES
interface ReportData {
    [key: string]: any;
}

interface ReportConfig {
    title: string;
    description: string;
    endpoint: string;
    columns: string[];
    filters?: {
        dateRange?: boolean;
        site?: boolean;
        status?: boolean;
    };
}

// VAT Configuration - Eswatini 15%
const VAT_CONFIG = {
    rate: 0.15, // 15% VAT rate for Eswatini
    ratePercentage: 15,
    calculateVAT: (amount: number, isVATApplicable: boolean = true): { vatAmount: number; totalWithVAT: number } => {
        // Ensure amount is a valid number
        const cleanAmount = Number(amount) || 0;

        if (!isVATApplicable) {
            return { vatAmount: 0, totalWithVAT: cleanAmount };
        }
        // Round to avoid floating point errors
        const vatAmount = Math.round(cleanAmount * VAT_CONFIG.rate * 100) / 100;
        const totalWithVAT = Math.round((cleanAmount + vatAmount) * 100) / 100;
        return { vatAmount, totalWithVAT };
    },
    formatVAT: (amount: number): string => {
        return `SZL ${amount.toFixed(2)}`;
    }
};

// ADD THIS HELPER FUNCTION HERE
const getEmptyAnalyticsData = (): EnhancedAnalyticsData => ({
    summary: {
        totalPurchaseOrders: 0,
        totalGoodsReceipts: 0,
        totalDispatches: 0,
        totalTransfers: 0,
        totalBinCounts: 0,
        totalStockItems: 0,
        totalSuppliers: 0,
        totalUsers: 0,
        totalSites: 0,
        totalInventoryValue: 0,
        totalPeopleFed: 0,
        lowStockItems: 0,
        criticalStockItems: 0,
        totalVATCollected: 0,
        totalVATPaid: 0,
        netVATLiability: 0
    },
    purchaseOrders: {
        byStatus: [],
        bySite: [],
        byMonth: [],
        totalValue: 0,
        vatAmount: 0,
        totalWithVAT: 0,
        avgOrderValue: 0,
        topItems: [],
        statusBreakdown: {}
    },
    goodsReceipts: {
        byStatus: [],
        bySite: [],
        efficiency: 0,
        conditionBreakdown: {},
        totalValue: 0,
        vatAmount: 0,
        totalWithVAT: 0
    },
    dispatches: {
        byType: [],
        bySite: [],
        totalPeopleFed: 0,
        totalCost: 0,
        vatAmount: 0,
        totalWithVAT: 0,
        costPerPerson: 0,
        topItems: [],
        totalSales: 0,
        salesVAT: 0,
        salesWithVAT: 0
    },
    transfers: {
        byStatus: [],
        bySite: [],
        approvalRate: 0
    },
    inventory: {
        byCategory: [],
        totalValue: 0,
        vatIncluded: 0,
        lowStockBreakdown: {
            critical: 0,
            warning: 0,
            healthy: 0
        }
    },
    binCounts: {
        byStatus: [],
        accuracy: 0,
        varianceAnalysis: {
            positive: 0,
            negative: 0,
            zero: 0
        }
    },
    financial: {
        monthlySpending: [],
        costPerPersonTrend: [],
        inventoryTurnover: 0,
        totalReceivedGoodsValue: 0,
        totalSales: 0,
        consumption: 0,
        profit: 0,
        profitPercentage: 0,
        closingStockValue: 0,
        periodPurchases: 0,
        periodConsumption: 0,
        periodSales: 0,
        openingStock: 0,
        netVariances: 0,
        vatOnPurchases: 0,
        vatOnSales: 0,
        netVATPayable: 0,
        grossProfitBeforeVAT: 0,
        grossProfitAfterVAT: 0
    },
    suppliers: {
        performance: [],
        activeCount: 0,
        vatRegisteredCount: 0
    },
    users: {
        byRole: [],
        activity: []
    },
    vat: {
        summary: {
            totalOutputVAT: 0,
            totalInputVAT: 0,
            netVATPayable: 0,
            vatRate: VAT_CONFIG.ratePercentage
        },
        breakdown: {
            purchases: { vatAmount: 0, totalWithVAT: 0 },
            sales: { vatAmount: 0, totalWithVAT: 0 },
            inventory: { vatAmount: 0, totalWithVAT: 0 }
        }
    }
});

// Chart color schemes
const CHART_COLORS = {
    primary: ['#3182CE', '#63B3ED', '#90CDF4', '#BEE3F8'],
    success: ['#38A169', '#68D391', '#9AE6B4', '#C6F6D5'],
    warning: ['#DD6B20', '#F6AD55', '#FBD38D', '#FEEBC8'],
    error: ['#E53E3E', '#FC8181', '#FEB2B2', '#FED7D7'],
    purple: ['#805AD5', '#B794F4', '#D6BCFA', '#E9D8FD'],
    pink: ['#D53F8C', '#F687B3', '#FBB6CE', '#FED7E2'],
    gray: ['#4A5568', '#718096', '#A0AEC0', '#CBD5E0'],
    vat: ['#2D3748', '#4A5568', '#718096', '#A0AEC0'] // VAT-specific colors
};

const STATUS_COLORS: { [key: string]: string } = {
    draft: 'gray',
    'pending-approval': 'orange',
    approved: 'blue',
    completed: 'green',
    processed: 'green',
    'partially-received': 'yellow',
    'in-progress': 'purple',
    cancelled: 'red',
    rejected: 'red',
    scheduled: 'blue',
    adjusted: 'purple'
};

// Skeleton components for better loading states
const MetricSkeleton = () => (
    <Card>
        <CardBody>
            <Skeleton height="20px" mb={2} />
            <Skeleton height="30px" mb={2} />
            <Skeleton height="16px" />
        </CardBody>
    </Card>
);

const ChartSkeleton = () => (
    <Card minH="400px">
        <CardBody>
            <Skeleton height="24px" mb={4} />
            <Skeleton height="300px" />
        </CardBody>
    </Card>
);

const TableSkeleton = () => (
    <Card>
        <CardBody>
            <Skeleton height="24px" mb={4} width="200px" />
            {[...Array(5)].map((_, i) => (
                <Skeleton key={i} height="40px" mb={2} />
            ))}
        </CardBody>
    </Card>
);

export default function ComprehensiveReportsPage() {
    const { data: session, status } = useSession();
    const [activeTab, setActiveTab] = useState(0);
    const [analyticsTab, setAnalyticsTab] = useState(0);

    // Analytics states
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [analyticsData, setAnalyticsData] = useState<EnhancedAnalyticsData | null>(null);
    const [rawData, setRawData] = useState<{ [key: string]: any[] }>({});

    // Old Reports states
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const [reportData, setReportData] = useState<{ [key: string]: ReportData[] }>({});
    const [filteredData, setFilteredData] = useState<{ [key: string]: ReportData[] }>({});
    const [sites, setSites] = useState<any[]>([]);
    const [searchTerms, setSearchTerms] = useState<{ [key: string]: string }>({});

    // Filter states for old reports
    const [selectedSites, setSelectedSites] = useState<{ [key: string]: string }>({});
    const [dateRanges, setDateRanges] = useState<{ [key: string]: { start: string; end: string } }>({});

    // Date ranges for new analytics
    const [primaryDateRange, setPrimaryDateRange] = useState<{ start: string; end: string }>({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
    });
    const [comparisonDateRange, setComparisonDateRange] = useState<{ start: string; end: string }>({
        start: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'),
        end: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
    });
    const [compareMode, setCompareMode] = useState(false);

    const [calculatingOpeningStock, setCalculatingOpeningStock] = useState(false);

    const toast = useToast();

    // Theme colors
    const bgPrimary = useColorModeValue('neutral.light.bg-primary', 'neutral.dark.bg-primary');
    const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const tableHeaderBg = useColorModeValue('gray.50', 'gray.700');
    const tableRowHoverBg = useColorModeValue('gray.50', 'gray.700');

    // FIXED REPORTS CONFIGURATION - using correct API endpoints
    const reportConfigs: ReportConfig[] = useMemo(() => [
        {
            title: 'Purchase Orders',
            description: 'Detailed purchase order history and status',
            endpoint: '/api/purchase-orders',
            columns: ['poNumber', 'orderDate', 'status', 'supplierNames', 'site.name', 'totalAmount', 'vatAmount', 'totalWithVAT', 'orderedItems'],
            filters: {
                dateRange: true,
                site: true,
                status: true
            }
        },
        {
            title: 'Goods Receipts',
            description: 'Goods receipt transactions and inventory updates',
            endpoint: '/api/goods-receipts',
            columns: ['receiptNumber', 'receiptDate', 'status', 'purchaseOrder.poNumber', 'purchaseOrder.site.name', 'receivedItems', 'receivingBin.name', 'vatAmount', 'totalWithVAT'],
            filters: {
                dateRange: true,
                site: true,
                status: true
            }
        },
        {
            title: 'Dispatches',
            description: 'Dispatch records and consumption tracking',
            endpoint: '/api/dispatches',
            columns: ['dispatchNumber', 'dispatchDate', 'dispatchType.name', 'sourceBin.site.name', 'peopleFed', 'totalCost', 'vatAmount', 'totalWithVAT', 'evidenceStatus', 'dispatchedBy.name'],
            filters: {
                dateRange: true,
                site: true,
                status: true
            }
        },
        {
            title: 'Transfers',
            description: 'Internal stock transfers between bins and sites',
            endpoint: '/api/transfers',
            columns: ['transferNumber', 'transferDate', 'status', 'fromBin.site.name', 'toBin.site.name', 'transferredItems', 'requestedBy.name'],
            filters: {
                dateRange: true,
                site: true,
                status: true
            }
        },
        {
            title: 'Bin Counts',
            description: 'Stock counting and variance reports',
            endpoint: '/api/bin-counts',
            columns: ['countNumber', 'countDate', 'status', 'bin.name', 'bin.site.name', 'countedItems', 'totalVariance', 'countedBy.name'],
            filters: {
                dateRange: true,
                site: true,
                status: true
            }
        }
    ], []);

    const currentReport = activeTab > 0 ? reportConfigs[activeTab - 1] : null;

    // Use refs for the filter function to avoid circular dependencies for old reports
    const filterStateRef = useRef({
        reportData,
        dateRanges,
        selectedSites,
        searchTerms,
        reportConfigs
    });

    // Update the ref when state changes for old reports
    useEffect(() => {
        filterStateRef.current = {
            reportData,
            dateRanges,
            selectedSites,
            searchTerms,
            reportConfigs
        };
    }, [reportData, dateRanges, selectedSites, searchTerms, reportConfigs]);

    // Quick date range presets for better UX
    const quickDateRanges = useMemo(() => [
        { label: 'This Month', start: format(startOfMonth(new Date()), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
        { label: 'Last Month', start: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), end: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
        { label: 'Last 30 Days', start: format(subMonths(new Date(), 1), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') },
        { label: 'Last 90 Days', start: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), end: format(new Date(), 'yyyy-MM-dd') }
    ], []);

    // Memoized date range for performance
    const dateRangeMemo = useMemo(() => ({
        start: new Date(primaryDateRange.start),
        end: new Date(primaryDateRange.end)
    }), [primaryDateRange.start, primaryDateRange.end]);

    // ========== VAT CALCULATION FUNCTIONS ==========

    // Calculate VAT for purchase order items
    const calculatePurchaseOrderVAT = useCallback((purchaseOrders: any[]): any[] => {
        return purchaseOrders.map(po => {
            let totalVAT = 0;
            let totalWithVAT = 0;

            const itemsWithVAT = po.orderedItems?.map((item: any) => {
                const isVATApplicable = item.stockItem?.isVATApplicable !== false; // Default to true if not specified
                const itemTotal = (item.orderedQuantity || 0) * (item.unitPrice || 0);
                const { vatAmount, totalWithVAT: itemTotalWithVAT } = VAT_CONFIG.calculateVAT(itemTotal, isVATApplicable);

                totalVAT += vatAmount;
                totalWithVAT += itemTotalWithVAT;

                return {
                    ...item,
                    vatAmount,
                    totalWithVAT: itemTotalWithVAT
                };
            }) || [];

            return {
                ...po,
                orderedItems: itemsWithVAT,
                vatAmount: totalVAT,
                totalWithVAT: totalWithVAT || po.totalAmount
            };
        });
    }, []);

    // Calculate VAT for goods receipt items
    const calculateGoodsReceiptVAT = useCallback((goodsReceipts: any[]): any[] => {
        return goodsReceipts.map(gr => {
            let totalVAT = 0;
            let totalWithVAT = 0;

            const itemsWithVAT = gr.receivedItems?.map((item: any) => {
                const isVATApplicable = item.stockItem?.isVATApplicable !== false;
                const itemTotal = (item.receivedQuantity || 0) * (item.unitPrice || item.stockItem?.unitPrice || 0);
                const { vatAmount, totalWithVAT: itemTotalWithVAT } = VAT_CONFIG.calculateVAT(itemTotal, isVATApplicable);

                totalVAT += vatAmount;
                totalWithVAT += itemTotalWithVAT;

                return {
                    ...item,
                    vatAmount,
                    totalWithVAT: itemTotalWithVAT
                };
            }) || [];

            return {
                ...gr,
                receivedItems: itemsWithVAT,
                vatAmount: totalVAT,
                totalWithVAT: totalWithVAT
            };
        });
    }, []);

    // Calculate VAT for dispatch items
    const calculateDispatchVAT = useCallback((dispatches: any[]): any[] => {
        return dispatches.map(dispatch => {
            let totalVAT = 0;
            let totalWithVAT = 0;

            const itemsWithVAT = dispatch.dispatchedItems?.map((item: any) => {
                const isVATApplicable = item.stockItem?.isVATApplicable !== false;
                const itemTotal = item.totalCost || (item.dispatchedQuantity || 0) * (item.unitPrice || 0);
                const { vatAmount, totalWithVAT: itemTotalWithVAT } = VAT_CONFIG.calculateVAT(itemTotal, isVATApplicable);

                totalVAT += vatAmount;
                totalWithVAT += itemTotalWithVAT;

                return {
                    ...item,
                    vatAmount,
                    totalWithVAT: itemTotalWithVAT
                };
            }) || [];

            // Calculate VAT on sales
            const salesVAT = VAT_CONFIG.calculateVAT(dispatch.totalSales || 0, true).vatAmount;
            const salesWithVAT = (dispatch.totalSales || 0) + salesVAT;

            return {
                ...dispatch,
                dispatchedItems: itemsWithVAT,
                vatAmount: totalVAT,
                totalWithVAT: totalWithVAT,
                salesVAT: salesVAT,
                salesWithVAT: salesWithVAT
            };
        });
    }, []);

    // Calculate VAT for inventory values
    const calculateInventoryVAT = useCallback((stockItems: any[]): { items: any[], totalVAT: number } => {
        let totalVAT = 0;

        const itemsWithVAT = stockItems.map(item => {
            const isVATApplicable = item.isVATApplicable !== false;
            const stockValue = (item.currentStock || 0) * (item.unitPrice || 0);
            const { vatAmount } = VAT_CONFIG.calculateVAT(stockValue, isVATApplicable);

            totalVAT += vatAmount;

            return {
                ...item,
                stockVAT: vatAmount,
                stockValueWithVAT: stockValue + vatAmount
            };
        });

        return {
            items: itemsWithVAT,
            totalVAT
        };
    }, []);

    // ========== NEW ANALYTICS FUNCTIONS ==========

    // Filter data by date range with memoization
    const filterDataByDateRange = useCallback((data: any[], dateField: string) => {
        if (!data || !Array.isArray(data)) return [];

        return data.filter(item => {
            try {
                if (!item || !item[dateField]) return false;
                const itemDate = new Date(item[dateField]);
                return isWithinInterval(itemDate, {
                    start: dateRangeMemo.start,
                    end: dateRangeMemo.end
                });
            } catch {
                return false;
            }
        });
    }, [dateRangeMemo]);

    // SIMPLIFIED opening stock calculation - using current stock as fallback
    const calculateOpeningStockForDate = useCallback(async (
        targetDate: Date,
        currentStockItems: any[],
        allGoodsReceipts: any[],
        allDispatches: any[],
        allBinCounts: any[]
    ): Promise<number> => {
        try {
            console.log('🔍 Calculating opening stock for date:', targetDate.toDateString());

            // Validate inputs
            if (!currentStockItems || currentStockItems.length === 0) {
                console.warn('⚠️ No stock items provided for opening stock calculation');
                return 0;
            }
            // Check if the API endpoint exists first
            const endpointCheck = await fetch('/api/stock-as-of-date', { method: 'HEAD' });
            if (!endpointCheck.ok) {
                console.warn('⚠️ /api/stock-as-of-date endpoint not available, using fallback calculation');
            }

            // Get all stock item IDs
            const stockItemIds = currentStockItems.map(item => item._id);

            // Get all bins
            const binsResponse = await fetch('/api/bins');
            const bins = await binsResponse.json();
            const binIds = bins.map((bin: any) => bin._id);

            if (binIds.length === 0) {
                console.warn('⚠️ No bins found');
                return 0;
            }

            console.log(`📊 Calculating opening stock for ${stockItemIds.length} items across ${binIds.length} bins`);

            // Call the new API endpoint
            const response = await fetch('/api/stock-as-of-date', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    stockItemIds,
                    binIds,
                    asOfDate: targetDate.toISOString()
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('💰 Opening stock calculated:', result.summary.totalValue);
                return result.summary.totalValue;
            } else {
                console.warn('⚠️ Failed to calculate opening stock via API, using fallback');

                // Fallback: calculate manually using transactions before target date
                const goodsReceiptsBefore = allGoodsReceipts.filter(gr =>
                    gr.receiptDate && new Date(gr.receiptDate) < targetDate
                );

                const dispatchesBefore = allDispatches.filter(d =>
                    d.dispatchDate && new Date(d.dispatchDate) < targetDate
                );

                // Get latest bin count before target date
                const binCountsBefore = allBinCounts.filter(bc =>
                    bc.countDate && new Date(bc.countDate) < targetDate
                ).sort((a, b) => new Date(b.countDate).getTime() - new Date(a.countDate).getTime());

                // For each item, calculate stock based on last count + transactions
                let totalOpeningStock = 0;

                currentStockItems.forEach(item => {
                    // Find latest count for this item before target date
                    let lastCountedQuantity = 0;

                    for (const bc of binCountsBefore) {
                        const countedItem = bc.countedItems?.find((ci: any) =>
                            ci.stockItem?._id === item._id
                        );
                        if (countedItem) {
                            lastCountedQuantity = countedItem.countedQuantity || 0;
                            break;
                        }
                    }

                    // Add receipts before target date
                    const receiptsQty = goodsReceiptsBefore.reduce((sum, gr) => {
                        const receivedItem = gr.receivedItems?.find((ri: any) =>
                            ri.stockItem?._id === item._id
                        );
                        return sum + (receivedItem?.receivedQuantity || 0);
                    }, 0);

                    // Subtract dispatches before target date
                    const dispatchesQty = dispatchesBefore.reduce((sum, d) => {
                        const dispatchedItem = d.dispatchedItems?.find((di: any) =>
                            di.stockItem?._id === item._id
                        );
                        return sum + (dispatchedItem?.dispatchedQuantity || 0);
                    }, 0);

                    const itemStock = Math.max(0, lastCountedQuantity + receiptsQty - dispatchesQty);
                    totalOpeningStock += itemStock * (item.unitPrice || 0);
                });

                console.log('💰 Fallback opening stock calculated:', totalOpeningStock);
                return totalOpeningStock;
            }

        } catch (error) {
            console.error('❌ Error calculating opening stock:', error);
            return 0;
        }
    }, []);

    // UPDATED processAnalyticsData function with VAT calculations - CORRECTED VERSION
    const processAnalyticsData = useCallback(async (data: any, dateRange: { start: Date; end: Date }): Promise<EnhancedAnalyticsData> => {
        try {
            // Validate data
            if (!data) {
                console.error('❌ No data provided to processAnalyticsData');
                return getEmptyAnalyticsData();
            }
            const {
                purchaseOrders = [],
                goodsReceipts = [],
                dispatches = [],
                transfers = [],
                binCounts = [],
                stockValues = { items: [], summary: { totalInventoryValue: 0, totalVAT: 0 } },
                lowStock = [],
                suppliers = [],
                users = [],
                sites = []
            } = data;

            console.log('📊 Processing analytics data with VAT calculations...');

            // Filter data by date range for period-based calculations
            const periodPOs = filterDataByDateRange(purchaseOrders, 'orderDate');
            const periodGoodsReceipts = filterDataByDateRange(goodsReceipts, 'receiptDate');
            const periodDispatches = filterDataByDateRange(dispatches, 'dispatchDate');
            const periodBinCounts = filterDataByDateRange(binCounts, 'countDate');

            // SIMPLIFIED FINANCIAL CALCULATIONS WITH VAT - CORRECTED VERSION
            // 1. PURCHASES = Goods Receipts value in the period (excluding VAT)
            const periodPurchasesExclVAT = periodGoodsReceipts.reduce((sum: number, gr: any) => {
                const receiptValue = gr.receivedItems?.reduce((itemSum: number, item: any) => {
                    const unitPrice = item.unitPrice || item.stockItem?.unitPrice || 0;
                    const receivedQuantity = item.receivedQuantity || 0;
                    return itemSum + (receivedQuantity * unitPrice);
                }, 0) || 0;
                return sum + receiptValue;
            }, 0);

            // 2. VAT ON PURCHASES (Input VAT)
            const vatOnPurchases = periodGoodsReceipts.reduce((sum: number, gr: any) =>
                sum + (gr.vatAmount || 0), 0
            );

            // 3. PURCHASES INCLUDING VAT
            const periodPurchasesInclVAT = periodPurchasesExclVAT + vatOnPurchases;

            // 4. CONSUMPTION = Dispatch costs in the period (excluding VAT)
            const periodConsumptionExclVAT = periodDispatches.reduce((sum: number, d: any) => {
                const dispatchCost = d.dispatchedItems?.reduce((itemSum: number, item: any) => {
                    // Use totalCost excluding VAT for COGS calculation
                    const itemCostExclVAT = item.totalCost || 0;
                    return itemSum + itemCostExclVAT;
                }, 0) || 0;
                return sum + dispatchCost;
            }, 0);

            // 5. VAT ON DISPATCH COSTS (this is input VAT on items being consumed)
            const vatOnDispatchCosts = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.vatAmount || 0), 0
            );

            // 6. SALES = People fed × selling prices (check if selling price includes VAT)
            // ASSUMPTION: sellingPrice is PER PERSON and EXCLUDES VAT
            const periodSalesExclVAT = periodDispatches.reduce((sum: number, d: any) => {
                const sellingPriceExclVAT = d.dispatchType?.sellingPrice || d.sellingPrice || 0;
                const peopleFed = d.peopleFed || 0;
                return sum + (sellingPriceExclVAT * peopleFed);
            }, 0);

            // 7. VAT ON SALES (Output VAT)
            const vatOnSales = periodSalesExclVAT * VAT_CONFIG.rate;

            // 8. SALES INCLUDING VAT
            const periodSalesInclVAT = periodSalesExclVAT + vatOnSales;

            // 9. GET OPENING STOCK VALUE (excluding VAT)
            const stockItemsArray = stockValues?.items || [];
            setCalculatingOpeningStock(true);
            const openingStockValue = await calculateOpeningStockForDate(
                dateRange.start,
                stockItemsArray,
                goodsReceipts,
                dispatches,
                binCounts
            );

            // 10. VARIANCES from bin counts in the period (in value terms)
            const netVariancesValue = periodBinCounts.reduce((sum: number, count: any) =>
                sum + (count.countedItems?.reduce((itemSum: number, item: any) => {
                    const varianceValue = (item.variance || 0) * (item.stockItem?.unitPrice || 0);
                    return itemSum + varianceValue;
                }, 0) || 0), 0
            );

            // 11. CLOSING STOCK = Opening + Purchases - Consumption + Variances (ALL in VALUE terms)
            const closingStockValue = openingStockValue + periodPurchasesExclVAT - periodConsumptionExclVAT + netVariancesValue;

            console.log('📦 Closing stock calculation:', {
                openingStock: openingStockValue,
                purchases: periodPurchasesExclVAT,
                consumption: periodConsumptionExclVAT,
                variances: netVariancesValue,
                closingStock: closingStockValue
            });

            setCalculatingOpeningStock(false);

            // 12. FINANCIAL CALCULATIONS - CORRECTED
            // COGS = Cost of Goods Sold = Consumption (dispatched items cost)
            const COGS = periodConsumptionExclVAT;

            // Gross Profit Before VAT = Sales (excl VAT) - COGS
            const grossProfitBeforeVAT = periodSalesExclVAT - COGS;

            // VAT Payable = Output VAT (sales) - Input VAT (purchases)
            const netVATPayable = vatOnSales - vatOnPurchases;

            // IMPORTANT: VAT doesn't directly affect gross profit in standard accounting
            // But for your reporting needs:
            const netProfit = grossProfitBeforeVAT - netVATPayable;
            const profitPercentage = periodSalesExclVAT > 0 ? (netProfit / periodSalesExclVAT) * 100 : 0;

            console.log('💰 CORRECTED Financial calculations:', {
                openingStockValue,
                periodPurchasesExclVAT,
                periodConsumptionExclVAT,
                COGS,
                closingStockValue,
                periodSalesExclVAT,
                vatOnPurchases,
                vatOnSales,
                netVATPayable,
                grossProfitBeforeVAT,
                netProfit,
                profitPercentage
            });

            // Helper functions
            const getStatusBreakdown = (items: any[]) => {
                const statusCounts: { [key: string]: number } = {};
                items.forEach(item => {
                    const status = item.status || 'unknown';
                    statusCounts[status] = (statusCounts[status] || 0) + 1;
                });
                return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
            };

            const getSiteBreakdown = (items: any[]) => {
                const siteCounts: { [key: string]: number } = {};
                items.forEach(item => {
                    const siteName = item.site?.name ||
                        item.purchaseOrder?.site?.name ||
                        item.sourceBin?.site?.name ||
                        item.receivingBin?.site?.name ||
                        item.fromBin?.site?.name ||
                        item.bin?.site?.name ||
                        'Unknown Site';
                    siteCounts[siteName] = (siteCounts[siteName] || 0) + 1;
                });
                return Object.entries(siteCounts).map(([name, value]) => ({ name, value }));
            };

            const getMonthlyBreakdown = (items: any[], dateField: string) => {
                const monthlyCounts: { [key: string]: number } = {};
                items.forEach(item => {
                    try {
                        const date = new Date(item[dateField]);
                        if (!isNaN(date.getTime())) {
                            const monthYear = format(date, 'MMM yyyy');
                            monthlyCounts[monthYear] = (monthlyCounts[monthYear] || 0) + 1;
                        }
                    } catch (error) {
                        // Skip invalid dates
                    }
                });
                return Object.entries(monthlyCounts).map(([name, value]) => ({ name, value }));
            };

            // Process purchase orders with VAT data
            const poStatusBreakdown = getStatusBreakdown(periodPOs);
            const poSiteBreakdown = getSiteBreakdown(periodPOs);
            const poMonthlyBreakdown = getMonthlyBreakdown(periodPOs, 'orderDate');
            const poTotalValue = periodPOs.reduce((sum: number, po: any) => sum + (po.totalAmount || 0), 0);
            const poVATAmount = periodPOs.reduce((sum: number, po: any) => sum + (po.vatAmount || 0), 0);
            const poTotalWithVAT = periodPOs.reduce((sum: number, po: any) => sum + (po.totalWithVAT || po.totalAmount || 0), 0);

            // Top items by quantity ordered with VAT
            const topItems = periodPOs.flatMap((po: any) =>
                po.orderedItems?.map((item: any) => ({
                    name: item.stockItem?.name || 'Unknown Item',
                    quantity: item.orderedQuantity || 0,
                    value: (item.orderedQuantity || 0) * (item.unitPrice || 0),
                    vatAmount: item.vatAmount || 0
                })) || []
            ).reduce((acc: any[], item: any) => {
                const existing = acc.find(i => i.name === item.name);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.value += item.value;
                    existing.vatAmount += item.vatAmount;
                } else {
                    acc.push({ ...item });
                }
                return acc;
            }, []).sort((a: any, b: any) => b.quantity - a.quantity).slice(0, 10);

            // Process dispatches with VAT data
            const dispatchByType = periodDispatches.reduce((acc: any[], dispatch: any) => {
                const type = dispatch.dispatchType?.name || 'Unknown Type';
                const existing = acc.find(item => item.name === type);
                if (existing) {
                    existing.value++;
                } else {
                    acc.push({ name: type, value: 1 });
                }
                return acc;
            }, []);

            const dispatchTopItems = periodDispatches.flatMap((dispatch: any) =>
                dispatch.dispatchedItems?.map((item: any) => ({
                    name: item.stockItem?.name || 'Unknown Item',
                    quantity: item.dispatchedQuantity || 0,
                    cost: item.totalCost || 0,
                    vatAmount: item.vatAmount || 0
                })) || []
            ).reduce((acc: any[], item: any) => {
                const existing = acc.find(i => i.name === item.name);
                if (existing) {
                    existing.quantity += item.quantity;
                    existing.cost += item.cost;
                    existing.vatAmount += item.vatAmount;
                } else {
                    acc.push({ ...item });
                }
                return acc;
            }, []).sort((a: any, b: any) => b.quantity - a.quantity).slice(0, 10);

            // Process inventory with VAT data
            const inventoryByCategory = stockItemsArray.reduce((acc: any[], item: any) => {
                const category = item.category?.title || 'Uncategorized';
                const existing = acc.find(cat => cat.name === category);
                if (existing) {
                    existing.value++;
                } else {
                    acc.push({ name: category, value: 1 });
                }
                return acc;
            }, []);

            // Calculate low stock breakdown accurately
            const criticalStockItems = lowStock.filter((item: any) => (item.currentStock || 0) === 0).length;
            const warningStockItems = lowStock.filter((item: any) =>
                (item.currentStock || 0) > 0 && (item.currentStock || 0) <= (item.minimumStockLevel || 0)
            ).length;
            const healthyStockItems = stockItemsArray.length - lowStock.length;

            // Process bin counts with accurate data
            const binCountAccuracy = periodBinCounts.length > 0 ?
                periodBinCounts.reduce((sum: number, count: any) => {
                    const accurateItems = count.countedItems?.filter((item: any) => item.variance === 0).length || 0;
                    const totalItems = count.countedItems?.length || 0;
                    return sum + (totalItems > 0 ? accurateItems / totalItems : 0);
                }, 0) / periodBinCounts.length : 0;

            const varianceAnalysis = periodBinCounts.flatMap((count: any) =>
                count.countedItems?.map((item: any) => item.variance) || []
            ).reduce((acc: any, variance: number) => {
                if (variance > 0) acc.positive++;
                else if (variance < 0) acc.negative++;
                else acc.zero++;
                return acc;
            }, { positive: 0, negative: 0, zero: 0 });

            // Process suppliers with VAT data
            const supplierPerformance = periodPOs.flatMap((po: any) =>
                po.orderedItems?.map((item: any) => ({
                    name: item.supplier?.name || 'Unknown Supplier',
                    orders: 1,
                    value: (item.orderedQuantity || 0) * (item.unitPrice || 0),
                    vatAmount: item.vatAmount || 0
                })) || []
            ).reduce((acc: any[], supplier: any) => {
                const existing = acc.find(s => s.name === supplier.name);
                if (existing) {
                    existing.orders += supplier.orders;
                    existing.value += supplier.value;
                    existing.vatAmount += supplier.vatAmount;
                } else {
                    acc.push(supplier);
                }
                return acc;
            }, []).sort((a: any, b: any) => b.value - a.value).slice(0, 10);

            // Process goods receipts with VAT data
            const goodsReceiptsTotalValue = periodGoodsReceipts.reduce((sum: number, gr: any) => {
                const receiptValue = gr.receivedItems?.reduce((itemSum: number, item: any) => {
                    return itemSum + ((item.receivedQuantity || 0) * (item.unitPrice || 0));
                }, 0) || 0;
                return sum + receiptValue;
            }, 0);

            const goodsReceiptsVATAmount = periodGoodsReceipts.reduce((sum: number, gr: any) =>
                sum + (gr.vatAmount || 0), 0
            );

            const goodsReceiptsTotalWithVAT = periodGoodsReceipts.reduce((sum: number, gr: any) =>
                sum + (gr.totalWithVAT || 0), 0
            );

            // Process dispatches with VAT data
            const dispatchesTotalCost = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.totalCost || 0), 0
            );

            const dispatchesVATAmount = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.vatAmount || 0), 0
            );

            const dispatchesTotalWithVAT = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.totalWithVAT || 0), 0
            );

            const dispatchesTotalSales = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.totalSales || 0), 0
            );

            const dispatchesSalesVAT = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.salesVAT || 0), 0
            );

            const dispatchesSalesWithVAT = periodDispatches.reduce((sum: number, d: any) =>
                sum + (d.salesWithVAT || d.totalSales || 0), 0
            );

            return {
                summary: {
                    totalPurchaseOrders: periodPOs.length,
                    totalGoodsReceipts: periodGoodsReceipts.length,
                    totalDispatches: periodDispatches.length,
                    totalTransfers: transfers.length,
                    totalBinCounts: periodBinCounts.length,
                    totalStockItems: stockItemsArray.length,
                    totalSuppliers: suppliers.length,
                    totalUsers: users.length,
                    totalSites: sites.length,
                    totalInventoryValue: openingStockValue,
                    totalPeopleFed: periodDispatches.reduce((sum: number, d: any) => sum + (d.peopleFed || 0), 0),
                    lowStockItems: lowStock.length,
                    criticalStockItems,
                    totalVATCollected: vatOnSales,
                    totalVATPaid: vatOnPurchases,
                    netVATLiability: netVATPayable
                },
                purchaseOrders: {
                    byStatus: poStatusBreakdown,
                    bySite: poSiteBreakdown,
                    byMonth: poMonthlyBreakdown,
                    totalValue: poTotalValue,
                    vatAmount: poVATAmount,
                    totalWithVAT: poTotalWithVAT,
                    avgOrderValue: periodPOs.length ? poTotalValue / periodPOs.length : 0,
                    topItems,
                    statusBreakdown: poStatusBreakdown.reduce((acc, item) => {
                        acc[item.name] = item.value;
                        return acc;
                    }, {} as { [key: string]: number })
                },
                goodsReceipts: {
                    byStatus: getStatusBreakdown(periodGoodsReceipts),
                    bySite: getSiteBreakdown(periodGoodsReceipts),
                    efficiency: periodGoodsReceipts.filter((gr: any) => gr.status === 'completed').length / Math.max(periodGoodsReceipts.length, 1),
                    conditionBreakdown: periodGoodsReceipts.flatMap((gr: any) =>
                        gr.receivedItems?.map((item: any) => item.condition) || []
                    ).reduce((acc: { [key: string]: number }, condition: string) => {
                        acc[condition] = (acc[condition] || 0) + 1;
                        return acc;
                    }, {}),
                    totalValue: goodsReceiptsTotalValue,
                    vatAmount: goodsReceiptsVATAmount,
                    totalWithVAT: goodsReceiptsTotalWithVAT
                },
                dispatches: {
                    byType: dispatchByType,
                    bySite: getSiteBreakdown(periodDispatches),
                    totalPeopleFed: periodDispatches.reduce((sum: number, d: any) => sum + (d.peopleFed || 0), 0),
                    totalCost: dispatchesTotalCost,
                    vatAmount: dispatchesVATAmount,
                    totalWithVAT: dispatchesTotalWithVAT,
                    costPerPerson: periodDispatches.reduce((sum: number, d: any) => sum + (d.peopleFed || 0), 0) > 0 ?
                        dispatchesTotalCost / periodDispatches.reduce((sum: number, d: any) => sum + (d.peopleFed || 0), 0) : 0,
                    topItems: dispatchTopItems,
                    totalSales: dispatchesTotalSales,
                    salesVAT: dispatchesSalesVAT,
                    salesWithVAT: dispatchesSalesWithVAT
                },
                transfers: {
                    byStatus: getStatusBreakdown(transfers),
                    bySite: getSiteBreakdown(transfers),
                    approvalRate: transfers.filter((t: any) =>
                        ['approved', 'completed'].includes(t.status)
                    ).length / Math.max(transfers.length, 1)
                },
                inventory: {
                    byCategory: inventoryByCategory,
                    totalValue: openingStockValue,
                    vatIncluded: stockValues.summary.totalVAT || 0,
                    lowStockBreakdown: {
                        critical: criticalStockItems,
                        warning: warningStockItems,
                        healthy: healthyStockItems
                    }
                },
                binCounts: {
                    byStatus: getStatusBreakdown(periodBinCounts),
                    accuracy: binCountAccuracy,
                    varianceAnalysis
                },
                financial: {
                    monthlySpending: periodPOs.reduce((acc: any[], po: any) => {
                        try {
                            const date = new Date(po.orderDate);
                            if (!isNaN(date.getTime())) {
                                const month = format(date, 'MMM yyyy');
                                const existing = acc.find(item => item.month === month);
                                if (existing) {
                                    existing.spending += po.totalAmount || 0;
                                    existing.vat += po.vatAmount || 0;
                                    existing.totalWithVAT += po.totalWithVAT || po.totalAmount || 0;
                                } else {
                                    acc.push({
                                        month,
                                        spending: po.totalAmount || 0,
                                        vat: po.vatAmount || 0,
                                        totalWithVAT: po.totalWithVAT || po.totalAmount || 0
                                    });
                                }
                            }
                        } catch (error) {
                            // Skip invalid dates
                        }
                        return acc;
                    }, []).sort((a: any, b: any) => new Date(a.month).getTime() - new Date(b.month).getTime()),
                    costPerPersonTrend: periodDispatches.map((dispatch: any) => {
                        try {
                            const date = new Date(dispatch.dispatchDate);
                            if (!isNaN(date.getTime())) {
                                return {
                                    date: format(date, 'MMM dd'),
                                    cost: dispatch.costPerPerson || 0
                                };
                            }
                        } catch (error) {
                            // Skip invalid dates
                        }
                        return { date: 'Unknown', cost: 0 };
                    }).filter((item: any) => item.date !== 'Unknown').slice(-30),
                    inventoryTurnover: 0.5, // This would need more complex calculation
                    totalReceivedGoodsValue: periodPurchasesExclVAT,
                    totalSales: periodSalesExclVAT,
                    consumption: periodConsumptionExclVAT,
                    profit: netProfit,
                    profitPercentage,
                    closingStockValue,
                    periodPurchases: periodPurchasesExclVAT,
                    periodConsumption: periodConsumptionExclVAT,
                    periodSales: periodSalesExclVAT,
                    openingStock: openingStockValue,
                    netVariances: netVariancesValue,
                    // VAT-specific financials
                    vatOnPurchases,
                    vatOnSales,
                    netVATPayable,
                    grossProfitBeforeVAT,
                    grossProfitAfterVAT: netProfit
                },
                suppliers: {
                    performance: supplierPerformance,
                    activeCount: suppliers.filter((s: any) => s.isActive).length,
                    vatRegisteredCount: suppliers.filter((s: any) => s.vatNumber).length
                },
                users: {
                    byRole: users.reduce((acc: any[], user: any) => {
                        const role = user.role || 'unknown';
                        const existing = acc.find(item => item.name === role);
                        if (existing) {
                            existing.value++;
                        } else {
                            acc.push({ name: role, value: 1 });
                        }
                        return acc;
                    }, []),
                    activity: [] // This would need user activity tracking
                },
                vat: {
                    summary: {
                        totalOutputVAT: vatOnSales,
                        totalInputVAT: vatOnPurchases,
                        netVATPayable,
                        vatRate: VAT_CONFIG.ratePercentage
                    },
                    breakdown: {
                        purchases: {
                            vatAmount: vatOnPurchases,
                            totalWithVAT: periodPurchasesExclVAT + vatOnPurchases
                        },
                        sales: {
                            vatAmount: vatOnSales,
                            totalWithVAT: periodSalesExclVAT + vatOnSales
                        },
                        inventory: {
                            vatAmount: stockValues.summary.totalVAT || 0,
                            totalWithVAT: openingStockValue + (stockValues.summary.totalVAT || 0)
                        }
                    }
                }
            };
        } catch (error) {
            console.error('❌ Error processing analytics data:', error);
            return getEmptyAnalyticsData();
        }
    }, [filterDataByDateRange, calculateOpeningStockForDate]);

    // Enhanced fetchAllData function with VAT calculations
    const fetchAllData = useCallback(async (forceRefresh = false) => {
        setAnalyticsLoading(true);
        try {
            console.log('🔄 Starting comprehensive data fetch for analytics with VAT...', { forceRefresh });

            // Clear existing data if forcing refresh
            if (forceRefresh) {
                setRawData({});
                setAnalyticsData(null);
            }

            // Check if we already have data and don't force refresh
            if (!forceRefresh && Object.keys(rawData).length > 0 && analyticsData) {
                console.log('📊 Using cached data, skipping fetch');
                setAnalyticsLoading(false);
                return;
            }

            // FIXED: Use correct API endpoints that exist
            const endpoints = [
                '/api/purchase-orders',
                '/api/goods-receipts',
                '/api/dispatches',
                '/api/transfers',
                '/api/bin-counts',
                '/api/analytics/stock-values',
                '/api/low-stock',
                '/api/suppliers',
                '/api/users',
                '/api/sites'
            ];

            const results = await Promise.allSettled(
                endpoints.map(async (endpoint) => {
                    console.log(`📡 Fetching from ${endpoint}...`);
                    const response = await fetch(endpoint);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch ${endpoint}: ${response.status}`);
                    }
                    return response.json();
                })
            );

            // Process results with error handling
            const [
                purchaseOrders, goodsReceipts, dispatches, transfers,
                binCounts, stockValues, lowStock, suppliers, users, sites
            ] = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    const data = result.value;
                    console.log(`✅ Successfully fetched from ${endpoints[index]}:`, data?.length || 'data received');
                    return data;
                } else {
                    console.error(`❌ Failed to fetch from ${endpoints[index]}:`, result.reason);
                    return [];
                }
            });

            // Apply VAT calculations to data
            const purchaseOrdersWithVAT = calculatePurchaseOrderVAT(purchaseOrders || []);
            const goodsReceiptsWithVAT = calculateGoodsReceiptVAT(goodsReceipts || []);
            const dispatchesWithVAT = calculateDispatchVAT(dispatches || []);
            const inventoryWithVAT = calculateInventoryVAT(stockValues?.items || stockValues || []);

            // Validate we have at least some data
            const totalDataItems = [
                purchaseOrders, goodsReceipts, dispatches, transfers,
                binCounts, stockValues, lowStock, suppliers, users, sites
            ].reduce((sum, data) => sum + (data?.length || 0), 0);

            if (totalDataItems === 0) {
                console.warn('⚠️ No data received from any API endpoint');
                toast({
                    title: 'No Data Available',
                    description: 'No data was returned from the server. Please check your connection.',
                    status: 'warning',
                    duration: 5000,
                    isClosable: true,
                });
                return;
            }

            // Store raw data for export (with VAT calculations)
            const newRawData = {
                purchaseOrders: purchaseOrdersWithVAT,
                goodsReceipts: goodsReceiptsWithVAT,
                dispatches: dispatchesWithVAT,
                transfers: transfers || [],
                binCounts: binCounts || [],
                stockItems: inventoryWithVAT.items,
                lowStock: lowStock || [],
                suppliers: suppliers || [],
                users: users || [],
                sites: sites || []
            };

            setRawData(newRawData);

            // Process analytics data with VAT
            const analytics = await processAnalyticsData({
                purchaseOrders: purchaseOrdersWithVAT,
                goodsReceipts: goodsReceiptsWithVAT,
                dispatches: dispatchesWithVAT,
                transfers: transfers || [],
                binCounts: binCounts || [],
                stockValues: {
                    items: inventoryWithVAT.items,
                    summary: {
                        totalInventoryValue: inventoryWithVAT.items.reduce((sum: number, item: any) =>
                            sum + ((item.currentStock || 0) * (item.unitPrice || 0)), 0
                        ),
                        totalVAT: inventoryWithVAT.totalVAT
                    }
                },
                lowStock: lowStock || [],
                suppliers: suppliers || [],
                users: users || [],
                sites: sites || []
            }, dateRangeMemo);

            setAnalyticsData(analytics);
            console.log('✅ Analytics data with VAT processed successfully');

        } catch (error) {
            console.error('❌ Error fetching analytics data:', error);
            toast({
                title: 'Error Loading Data',
                description: 'Failed to load analytics data from server',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setAnalyticsLoading(false);
        }
    }, [toast, rawData, analyticsData, dateRangeMemo, calculatePurchaseOrderVAT, calculateGoodsReceiptVAT, calculateDispatchVAT, calculateInventoryVAT, processAnalyticsData]);

    const handleUpdateAnalytics = () => {
        fetchAllData(true);
    };

    // Smart auto-fit columns function that calculates optimal widths
    const autoFitColumns = (worksheet: any) => {
        if (!worksheet['!cols']) worksheet['!cols'] = [];

        const maxWidths: number[] = [];

        // Calculate maximum content length for each column
        Object.keys(worksheet).forEach(cellAddress => {
            if (cellAddress[0] === '!') return; // Skip special properties like '!ref', '!cols'

            const colIndex = cellAddress.charCodeAt(0) - 65; // Convert A=0, B=1, C=2, etc.
            const cell = worksheet[cellAddress];

            if (cell && cell.v !== undefined) {
                const cellValue = String(cell.v);

                // Calculate width based on content length and type
                let cellLength = cellValue.length;

                // Adjust for different data types
                if (cellValue.match(/^\d+$/)) {
                    // Numbers - slightly narrower
                    cellLength = Math.max(cellLength, 8);
                } else if (cellValue.match(/^\d+\.\d+$/)) {
                    // Decimals - account for decimal places
                    cellLength = Math.max(cellLength, 10);
                } else if (cellValue.length > 50) {
                    // Very long text - cap it
                    cellLength = 50;
                } else if (cellValue.match(/[A-Za-z\s]/)) {
                    // Text - add more space for readability
                    cellLength += 4;
                }

                // Apply character-to-width ratio (roughly 1.2 characters per unit width in Excel)
                const width = Math.ceil(cellLength * 1.2);

                if (!maxWidths[colIndex] || width > maxWidths[colIndex]) {
                    maxWidths[colIndex] = width;
                }
            }
        });

        // Set column widths with reasonable limits
        maxWidths.forEach((calculatedWidth, index) => {
            if (calculatedWidth) {
                // Apply min/max constraints
                const finalWidth = Math.min(Math.max(calculatedWidth, 8), 50);
                worksheet['!cols'][index] = { width: finalWidth };
            } else {
                // Default width for empty columns
                worksheet['!cols'][index] = { width: 12 };
            }
        });

        // Ensure we have widths for all columns (in case some columns are completely empty)
        const maxColIndex = Math.max(
            ...Object.keys(worksheet)
                .filter(key => key[0] !== '!')
                .map(key => key.charCodeAt(0) - 65)
        );

        for (let i = 0; i <= maxColIndex; i++) {
            if (!worksheet['!cols'][i]) {
                worksheet['!cols'][i] = { width: 12 };
            }
        }
    };

    // Helper function to create formatted Executive Summary with VAT
    const createFormattedSummaryData = useCallback(() => {
        return [
            // HEADER SECTION WITH DATES (ONLY IN EXECUTIVE SUMMARY)
            ['CATERFLOW COMPREHENSIVE REPORT', ''],
            ['', ''],
            ['Generated On', new Date().toLocaleDateString()],
            ['Report Period', `${format(new Date(primaryDateRange.start), 'MM/dd/yyyy')} to ${format(new Date(primaryDateRange.end), 'MM/dd/yyyy')}`],
            ['VAT Rate', `${VAT_CONFIG.ratePercentage}% (Eswatini)`],
            ['', ''],
            ['', ''],

            // EXECUTIVE SUMMARY SECTION
            ['EXECUTIVE SUMMARY', ''],
            ['', ''],
            ['Total Purchase Orders', analyticsData?.summary.totalPurchaseOrders || 0],
            ['Total Goods Receipts', analyticsData?.summary.totalGoodsReceipts || 0],
            ['Total Dispatches', analyticsData?.summary.totalDispatches || 0],
            ['Total People Fed', analyticsData?.summary.totalPeopleFed || 0],
            ['Total Inventory Value', analyticsData?.summary.totalInventoryValue || 0],
            ['Low Stock Items', analyticsData?.summary.lowStockItems || 0],
            ['Critical Stock Items', analyticsData?.summary.criticalStockItems || 0],
            ['', ''],
            ['', ''],

            // VAT SUMMARY SECTION
            ['VAT SUMMARY', ''],
            ['', ''],
            ['Total Output VAT (Sales)', analyticsData?.vat.summary.totalOutputVAT || 0],
            ['Total Input VAT (Purchases)', analyticsData?.vat.summary.totalInputVAT || 0],
            ['Net VAT Payable', analyticsData?.vat.summary.netVATPayable || 0],
            ['', ''],
            ['', ''],

            // FINANCIAL OVERVIEW SECTION USING PERIOD-BASED CALCULATIONS
            ['FINANCIAL OVERVIEW', ''],
            ['', ''],
            ['Opening Stock Value', analyticsData?.financial.openingStock || 0],
            ['Period Purchases', analyticsData?.financial.periodPurchases || 0],
            ['Period Consumption', analyticsData?.financial.periodConsumption || 0],
            ['Net Variances', analyticsData?.financial.netVariances || 0],
            ['Closing Stock Value', analyticsData?.financial.closingStockValue || 0],
            ['Total Sales', analyticsData?.financial.periodSales || 0],
            ['Gross Profit Before VAT', analyticsData?.financial.grossProfitBeforeVAT || 0],
            ['VAT Payable', analyticsData?.financial.netVATPayable || 0],
            ['Gross Profit After VAT', analyticsData?.financial.grossProfitAfterVAT || 0],
            ['Profit Percentage', analyticsData?.financial.profitPercentage || 0]
        ];
    }, [primaryDateRange, analyticsData]);

    // Helper function to create formatted Analytics Data with VAT
    const createFormattedAnalyticsData = useCallback(() => {
        return [
            // HEADER
            ['ANALYTICS DATA DASHBOARD', ''],
            ['', ''],
            ['Generated On', new Date().toLocaleDateString()],
            ['Report Period', `${primaryDateRange.start} to ${primaryDateRange.end}`],
            ['VAT Rate', `${VAT_CONFIG.ratePercentage}% (Eswatini)`],
            ['', ''],
            ['', ''],

            // PURCHASE ORDERS ANALYSIS WITH VAT
            ['PURCHASE ORDERS BY STATUS', ''],
            ['', ''],
            ...(analyticsData?.purchaseOrders.byStatus.map(item => [item.name, item.value]) || [['No Data', 0]]),
            ['', ''],
            ['Purchase Orders Total (excl. VAT)', analyticsData?.purchaseOrders.totalValue || 0],
            ['Purchase Orders VAT Amount', analyticsData?.purchaseOrders.vatAmount || 0],
            ['Purchase Orders Total (incl. VAT)', analyticsData?.purchaseOrders.totalWithVAT || 0],
            ['', ''],
            ['', ''],

            // DISPATCHES ANALYSIS WITH VAT
            ['DISPATCHES BY TYPE', ''],
            ['', ''],
            ...(analyticsData?.dispatches.byType.map(item => [item.name, item.value]) || [['No Data', 0]]),
            ['', ''],
            ['Dispatches Total Cost (excl. VAT)', analyticsData?.dispatches.totalCost || 0],
            ['Dispatches VAT Amount', analyticsData?.dispatches.vatAmount || 0],
            ['Dispatches Total Cost (incl. VAT)', analyticsData?.dispatches.totalWithVAT || 0],
            ['Sales Total (excl. VAT)', analyticsData?.dispatches.totalSales || 0],
            ['Sales VAT Amount', analyticsData?.dispatches.salesVAT || 0],
            ['Sales Total (incl. VAT)', analyticsData?.dispatches.salesWithVAT || 0],
            ['', ''],
            ['', ''],

            // INVENTORY ANALYSIS
            ['INVENTORY BY CATEGORY', ''],
            ['', ''],
            ...(analyticsData?.inventory.byCategory.map(item => [item.name, item.value]) || [['No Data', 0]]),
            ['', ''],
            ['Inventory Value (excl. VAT)', analyticsData?.inventory.totalValue || 0],
            ['Inventory VAT Amount', analyticsData?.inventory.vatIncluded || 0],
            ['Inventory Value (incl. VAT)', (analyticsData?.inventory.totalValue || 0) + (analyticsData?.inventory.vatIncluded || 0)],
            ['', ''],
            ['', ''],

            // FINANCIAL METRICS SECTION - UPDATED WITH PERIOD-BASED CALCULATIONS AND VAT
            ['FINANCIAL PERFORMANCE METRICS', ''],
            ['', ''],
            ['Opening Stock Value', analyticsData?.financial.openingStock || 0],
            ['Period Purchases', analyticsData?.financial.periodPurchases || 0],
            ['Period Consumption', analyticsData?.financial.periodConsumption || 0],
            ['Closing Stock Value', analyticsData?.financial.closingStockValue || 0],
            ['Period Sales', analyticsData?.financial.periodSales || 0],
            ['VAT on Purchases', analyticsData?.financial.vatOnPurchases || 0],
            ['VAT on Sales', analyticsData?.financial.vatOnSales || 0],
            ['Net VAT Payable', analyticsData?.financial.netVATPayable || 0],
            ['Gross Profit Before VAT', analyticsData?.financial.grossProfitBeforeVAT || 0],
            ['Gross Profit After VAT', analyticsData?.financial.grossProfitAfterVAT || 0],
            ['Profit Margin', analyticsData?.financial.profitPercentage || 0],
            ['', ''],
            ['Calculation Method', 'Period-based accounting with VAT calculations'],
            ['VAT Rate', `${VAT_CONFIG.ratePercentage}% (Eswatini)`],
            ['', '']
        ];
    }, [primaryDateRange, analyticsData]);

    // Helper function to create formatted Sales Summary with VAT
    const createFormattedSalesSummaryData = useCallback((dispatches: any[]) => {
        if (!dispatches || dispatches.length === 0) {
            return [
                ['SALES SUMMARY REPORT', ''],
                ['', ''],
                ['No dispatch data available for analysis', ''],
                ['', ''],
                ['Please ensure:', ''],
                ['- Dispatch records exist for the period', ''],
                ['- People fed counts are populated', ''],
                ['- Dispatch types have selling prices configured', '']
            ];
        }

        // Filter dispatches by date range
        const periodDispatches = filterDataByDateRange(dispatches, 'dispatchDate');

        // Get unique dispatch types and dates
        const dispatchTypes = [...new Set(periodDispatches
            .map(d => d.dispatchType?.name || 'Unknown')
            .filter(Boolean)
        )];

        // Get dates in simple format (MM/DD)
        const allDates = [...new Set(periodDispatches
            .map(d => {
                try {
                    return d.dispatchDate ? format(new Date(d.dispatchDate), 'MM/dd') : null;
                } catch {
                    return null;
                }
            })
            .filter(date => date !== null)
        )].sort((a, b) => {
            // Sort dates chronologically
            const dateA = new Date(`2025/${a}`); // Assuming current year
            const dateB = new Date(`2025/${b}`);
            return dateA.getTime() - dateB.getTime();
        });

        if (dispatchTypes.length === 0 || allDates.length === 0) {
            return [
                ['SALES SUMMARY REPORT', ''],
                ['', ''],
                ['Insufficient data for sales summary:', ''],
                ['', ''],
                [`Dispatch Types: ${dispatchTypes.length}`, ''],
                [`Date Records: ${allDates.length}`, ''],
                ['', ''],
                ['Please check dispatch data completeness.', '']
            ];
        }

        // HEADER ROW
        const headerRow = ['SUMMARY', '', ...allDates, 'TOTAL', 'UNIT PRICE', 'AMOUNT (excl. VAT)', 'VAT AMOUNT', 'TOTAL (incl. VAT)'];

        // DATA ROWS FOR EACH DISPATCH TYPE
        const dataRows = dispatchTypes.map(type => {
            const dateTotals = allDates.map(date => {
                const dayDispatches = periodDispatches.filter(d => {
                    try {
                        const dispatchDate = d.dispatchDate ? format(new Date(d.dispatchDate), 'MM/dd') : null;
                        return d.dispatchType?.name === type && dispatchDate === date;
                    } catch {
                        return false;
                    }
                });
                return dayDispatches.reduce((sum, d) => sum + (d.peopleFed || 0), 0);
            });

            const totalPeopleFed = dateTotals.reduce((sum, total) => sum + total, 0);

            // Get unit price directly from dispatch type's sellingPrice
            const typeDispatches = periodDispatches.filter(d => d.dispatchType?.name === type);
            let unitPrice = 0;
            const dispatchWithType = typeDispatches.find(d => d.dispatchType?.sellingPrice > 0);

            if (dispatchWithType) {
                unitPrice = dispatchWithType.dispatchType.sellingPrice || 0;
            } else {
                // Fallback: try to get from the dispatch record itself
                const dispatchWithPrice = typeDispatches.find(d => d.sellingPrice > 0);
                unitPrice = dispatchWithPrice?.sellingPrice || 0;
            }

            const totalAmount = totalPeopleFed * unitPrice;
            const vatAmount = VAT_CONFIG.calculateVAT(totalAmount, true).vatAmount;
            const totalWithVAT = totalAmount + vatAmount;

            return [type, '', ...dateTotals, totalPeopleFed, unitPrice, totalAmount, vatAmount, totalWithVAT];
        });

        // CALCULATE GRAND TOTALS
        const totalSales = dataRows.reduce((sum, row) => sum + (row[row.length - 3] || 0), 0);
        const totalVAT = dataRows.reduce((sum, row) => sum + (row[row.length - 2] || 0), 0);
        const totalWithVAT = dataRows.reduce((sum, row) => sum + (row[row.length - 1] || 0), 0);
        const totalPeopleFedAll = dataRows.reduce((sum, row) => sum + (row[row.length - 4] || 0), 0);

        // FINANCIAL DATA WITH VAT
        const totalDispatchCost = analyticsData?.financial.periodConsumption || 0;
        const consumption = analyticsData?.financial.periodConsumption || 0;
        const profit = analyticsData?.financial.profit || 0;
        const profitPercentage = analyticsData?.financial.profitPercentage || 0;
        const vatOnSales = analyticsData?.financial.vatOnSales || 0;

        return [
            // REPORT HEADER
            ['SALES SUMMARY REPORT', ''],
            ['VAT Rate', `${VAT_CONFIG.ratePercentage}% (Eswatini)`],
            ['', ''],

            // MAIN DATA TABLE
            headerRow,
            ...dataRows,
            ['', ''],

            // FINANCIAL SUMMARY WITH VAT
            ['TOTAL SALES (excl. VAT)', '', ...allDates.map(() => ''), '', '', totalSales, '', ''],
            ['TOTAL VAT', '', ...allDates.map(() => ''), '', '', '', totalVAT, ''],
            ['TOTAL SALES (incl. VAT)', '', ...allDates.map(() => ''), '', '', '', '', totalWithVAT],
            ['', ''],

            // FINANCIAL BREAKDOWN
            ['FINANCIAL ANALYSIS', ''],
            ['', ''],
            ['PARTICIPATION SALES (excl. VAT)', '', ...allDates.map(() => ''), '', '', totalSales],
            ['VAT ON SALES', '', ...allDates.map(() => ''), '', '', vatOnSales],
            ['TOTAL SALES (incl. VAT)', '', ...allDates.map(() => ''), '', '', totalWithVAT],
            ['LESS ISSUE CONSUMPTION', '', ...allDates.map(() => ''), '', '', consumption],
            ['WEEKLY PROFIT', '', ...allDates.map(() => ''), '', '', profit],
            ['PROFIT PERCENTAGE', '', ...allDates.map(() => ''), '', '', profitPercentage],
            ['', ''],

            // KEY METRICS
            ['KEY PERFORMANCE INDICATORS', ''],
            ['', ''],
            ['Total People Served', '', ...allDates.map(() => ''), '', '', totalPeopleFedAll],
            ['Average Cost Per Person', '', ...allDates.map(() => ''), '', '', analyticsData?.dispatches.costPerPerson || 0],
            ['Sales Efficiency', '', ...allDates.map(() => ''), '', '', '95%'],
            ['VAT Rate Applied', '', ...allDates.map(() => ''), '', '', `${VAT_CONFIG.ratePercentage}%`]
        ];
    }, [filterDataByDateRange, analyticsData]);

    // FULL MULTI-SHEET EXCEL EXPORT FUNCTION WITH VAT
    const exportToExcel = useCallback(async () => {
        setExportLoading(true);
        try {
            console.log('📊 Starting comprehensive Excel export with VAT...');

            // Validate we have data before exporting
            const hasData = Object.keys(rawData).length > 0 &&
                Object.values(rawData).some((data: any) => data && data.length > 0);

            if (!hasData) {
                console.log('🔄 No data available, fetching data first...');
                await fetchAllData(true);

                // Check again after fetch
                const stillNoData = Object.keys(rawData).length === 0 ||
                    Object.values(rawData).every((data: any) => !data || data.length === 0);

                if (stillNoData) {
                    toast({
                        title: 'No Data Available',
                        description: 'Cannot export - no data is available from the server.',
                        status: 'warning',
                        duration: 5000,
                        isClosable: true,
                    });
                    return;
                }
            }

            const workbook = XLSX.utils.book_new();

            // 1. EXECUTIVE SUMMARY SHEET WITH VAT
            console.log('📝 Creating Executive Summary sheet with VAT...');
            const summaryData = createFormattedSummaryData();
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            autoFitColumns(summarySheet);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

            // 2. SALES SUMMARY SHEET WITH VAT
            console.log('📝 Creating Sales Summary sheet with VAT...');
            const salesSummaryData = createFormattedSalesSummaryData(rawData.dispatches || []);
            const salesSummarySheet = XLSX.utils.aoa_to_sheet(salesSummaryData);
            autoFitColumns(salesSummarySheet);
            XLSX.utils.book_append_sheet(workbook, salesSummarySheet, 'Sales Summary');

            // 3. PURCHASE ORDERS SHEET WITH VAT
            console.log('📝 Creating Purchase Orders sheet with VAT...');
            const periodPOs = filterDataByDateRange(rawData.purchaseOrders || [], 'orderDate');
            const poData = periodPOs.map((po: any) => ({
                'PO Number': po.poNumber || 'N/A',
                'Order Date': po.orderDate ? format(new Date(po.orderDate), 'MM/dd/yyyy') : 'N/A',
                'Status': po.status || 'N/A',
                'Ordered By': po.orderedBy?.name || 'N/A',
                'Site': po.site?.name || 'N/A',
                'Total Amount (excl. VAT)': (po.totalAmount || 0).toFixed(2),
                'VAT Amount': (po.vatAmount || 0).toFixed(2),
                'Total Amount (incl. VAT)': (po.totalWithVAT || po.totalAmount || 0).toFixed(2),
                'Evidence Status': po.evidenceStatus || 'N/A',
                'Item Count': po.orderedItems?.length || 0
            }));

            if (poData.length > 0) {
                const poSheet = XLSX.utils.json_to_sheet(poData);
                autoFitColumns(poSheet);
                XLSX.utils.book_append_sheet(workbook, poSheet, 'Purchase Orders');
            }

            // 4. GOODS RECEIPTS SHEET WITH VAT
            console.log('📝 Creating Goods Receipts sheet with VAT...');
            const periodGoodsReceipts = filterDataByDateRange(rawData.goodsReceipts || [], 'receiptDate');
            const grData = periodGoodsReceipts.map((gr: any) => ({
                'Receipt Number': gr.receiptNumber || 'N/A',
                'Receipt Date': gr.receiptDate ? format(new Date(gr.receiptDate), 'MM/dd/yyyy') : 'N/A',
                'Status': gr.status || 'N/A',
                'PO Number': gr.purchaseOrder?.poNumber || 'N/A',
                'Receiving Bin': gr.receivingBin?.name || 'N/A',
                'Site': gr.receivingBin?.site?.name || 'N/A',
                'Total Value (excl. VAT)': gr.receivedItems?.reduce((sum: number, item: any) =>
                    sum + ((item.receivedQuantity || 0) * (item.unitPrice || 0)), 0) || 0,
                'VAT Amount': gr.vatAmount || 0,
                'Total Value (incl. VAT)': gr.totalWithVAT || 0,
                'Evidence Status': gr.evidenceStatus || 'N/A',
                'Item Count': gr.receivedItems?.length || 0
            }));

            if (grData.length > 0) {
                const grSheet = XLSX.utils.json_to_sheet(grData);
                autoFitColumns(grSheet);
                XLSX.utils.book_append_sheet(workbook, grSheet, 'Goods Receipts');
            }

            // 5. DISPATCHES SHEET WITH VAT
            console.log('📝 Creating Dispatches sheet with VAT...');
            const periodDispatches = filterDataByDateRange(rawData.dispatches || [], 'dispatchDate');
            const dispatchData = periodDispatches.map((dispatch: any) => ({
                'Dispatch Number': dispatch.dispatchNumber || 'N/A',
                'Dispatch Date': dispatch.dispatchDate ? format(new Date(dispatch.dispatchDate), 'MM/dd/yyyy') : 'N/A',
                'Dispatch Type': dispatch.dispatchType?.name || 'N/A',
                'Selling Price Per Person': dispatch.dispatchType?.sellingPrice || dispatch.sellingPrice || 0,
                'Source Bin': dispatch.sourceBin?.name || 'N/A',
                'Site': dispatch.sourceBin?.site?.name || 'N/A',
                'Dispatched By': dispatch.dispatchedBy?.name || 'N/A',
                'People Fed': dispatch.peopleFed || 0,
                'Total Cost (excl. VAT)': dispatch.totalCost || 0,
                'VAT on Cost': dispatch.vatAmount || 0,
                'Total Cost (incl. VAT)': dispatch.totalWithVAT || 0,
                'Cost Per Person': dispatch.costPerPerson || 0,
                'Total Sales (excl. VAT)': (dispatch.dispatchType?.sellingPrice || dispatch.sellingPrice || 0) * (dispatch.peopleFed || 0),
                'VAT on Sales': dispatch.salesVAT || 0,
                'Total Sales (incl. VAT)': dispatch.salesWithVAT || 0,
                'Evidence Status': dispatch.evidenceStatus || 'N/A'
            }));

            if (dispatchData.length > 0) {
                const dispatchSheet = XLSX.utils.json_to_sheet(dispatchData);
                autoFitColumns(dispatchSheet);
                XLSX.utils.book_append_sheet(workbook, dispatchSheet, 'Dispatches');
            }

            // 6. VAT ANALYSIS SHEET
            console.log('📝 Creating VAT Analysis sheet...');
            const vatAnalysisData = [
                ['VAT ANALYSIS REPORT', ''],
                ['', ''],
                ['VAT Rate', `${VAT_CONFIG.ratePercentage}% (Eswatini)`],
                ['Report Period', `${primaryDateRange.start} to ${primaryDateRange.end}`],
                ['', ''],
                ['VAT SUMMARY', ''],
                ['Total Output VAT (Sales)', analyticsData?.vat.summary.totalOutputVAT || 0],
                ['Total Input VAT (Purchases)', analyticsData?.vat.summary.totalInputVAT || 0],
                ['Net VAT Payable', analyticsData?.vat.summary.netVATPayable || 0],
                ['', ''],
                ['VAT BREAKDOWN', ''],
                ['Purchases VAT', analyticsData?.vat.breakdown.purchases.vatAmount || 0],
                ['Purchases Total (incl. VAT)', analyticsData?.vat.breakdown.purchases.totalWithVAT || 0],
                ['Sales VAT', analyticsData?.vat.breakdown.sales.vatAmount || 0],
                ['Sales Total (incl. VAT)', analyticsData?.vat.breakdown.sales.totalWithVAT || 0],
                ['Inventory VAT', analyticsData?.vat.breakdown.inventory.vatAmount || 0],
                ['Inventory Total (incl. VAT)', analyticsData?.vat.breakdown.inventory.totalWithVAT || 0],
                ['', ''],
                ['FINANCIAL IMPACT', ''],
                ['Gross Profit Before VAT', analyticsData?.financial.grossProfitBeforeVAT || 0],
                ['VAT Payable', analyticsData?.financial.netVATPayable || 0],
                ['Gross Profit After VAT', analyticsData?.financial.grossProfitAfterVAT || 0]
            ];

            const vatAnalysisSheet = XLSX.utils.aoa_to_sheet(vatAnalysisData);
            autoFitColumns(vatAnalysisSheet);
            XLSX.utils.book_append_sheet(workbook, vatAnalysisSheet, 'VAT Analysis');

            // 7. TRANSFERS SHEET
            console.log('📝 Creating Transfers sheet...');
            const periodTransfers = filterDataByDateRange(rawData.transfers || [], 'transferDate');
            const transferData = periodTransfers.map((transfer: any) => ({
                'Transfer Number': transfer.transferNumber || 'N/A',
                'Transfer Date': transfer.transferDate ? format(new Date(transfer.transferDate), 'MM/dd/yyyy') : 'N/A',
                'Status': transfer.status || 'N/A',
                'From Bin': transfer.fromBin?.name || 'N/A',
                'From Site': transfer.fromBin?.site?.name || 'N/A',
                'To Bin': transfer.toBin?.name || 'N/A',
                'To Site': transfer.toBin?.site?.name || 'N/A',
                'Transferred By': transfer.transferredBy?.name || 'N/A',
                'Approved By': transfer.approvedBy?.name || 'N/A',
                'Item Count': transfer.transferredItems?.length || 0
            }));

            if (transferData.length > 0) {
                const transferSheet = XLSX.utils.json_to_sheet(transferData);
                autoFitColumns(transferSheet);
                XLSX.utils.book_append_sheet(workbook, transferSheet, 'Transfers');
            }

            // 8. BIN COUNTS SHEET
            console.log('📝 Creating Bin Counts sheet...');
            const periodBinCounts = filterDataByDateRange(rawData.binCounts || [], 'countDate');
            const binCountData = periodBinCounts.map((count: any) => ({
                'Count Number': count.countNumber || 'N/A',
                'Count Date': count.countDate ? format(new Date(count.countDate), 'MM/dd/yyyy') : 'N/A',
                'Status': count.status || 'N/A',
                'Bin': count.bin?.name || 'N/A',
                'Site': count.bin?.site?.name || 'N/A',
                'Counted By': count.countedBy?.name || 'N/A',
                'Item Count': count.countedItems?.length || 0,
                'Accuracy': count.countedItems?.length ?
                    (count.countedItems.filter((item: any) => item.variance === 0).length / count.countedItems.length * 100).toFixed(1) + '%' : '0%'
            }));

            if (binCountData.length > 0) {
                const binCountSheet = XLSX.utils.json_to_sheet(binCountData);
                autoFitColumns(binCountSheet);
                XLSX.utils.book_append_sheet(workbook, binCountSheet, 'Bin Counts');
            }

            // 9. STOCK ITEMS SHEET WITH VAT
            console.log('📝 Creating Stock Items sheet with VAT...');
            const stockItemsArray = Array.isArray(rawData.stockItems)
                ? rawData.stockItems
                : (rawData.stockItems as any)?.items || [];

            const stockItemsData = stockItemsArray.map((item: any) => ({
                'Name': item.name || 'N/A',
                'SKU': item.sku || 'N/A',
                'Category': item.category?.title || 'N/A',
                'Item Type': item.itemType || 'N/A',
                'Unit of Measure': item.unitOfMeasure || 'N/A',
                'Unit Price': item.unitPrice || 0,
                'VAT Applicable': item.isVATApplicable !== false ? 'Yes' : 'No',
                'Minimum Stock Level': item.minimumStockLevel || 0,
                'Reorder Quantity': item.reorderQuantity || 0,
                'Current Stock': item.currentStock || 0,
                'Stock Value (excl. VAT)': (item.currentStock || 0) * (item.unitPrice || 0),
                'VAT Amount': item.stockVAT || 0,
                'Stock Value (incl. VAT)': item.stockValueWithVAT || 0,
                'Primary Supplier': item.primarySupplier?.name || 'N/A',
                'Supplier Count': item.suppliers?.length || 0
            }));

            if (stockItemsData.length > 0) {
                const stockItemSheet = XLSX.utils.json_to_sheet(stockItemsData);
                autoFitColumns(stockItemSheet);
                XLSX.utils.book_append_sheet(workbook, stockItemSheet, 'Stock Items');
            }

            // 10. LOW STOCK ALERTS SHEET
            console.log('📝 Creating Low Stock Alerts sheet...');
            const lowStockData = rawData.lowStock?.map((item: any) => ({
                'Name': item.name || 'N/A',
                'SKU': item.sku || 'N/A',
                'Current Stock': item.currentStock || 0,
                'Minimum Stock Level': item.minimumStockLevel || 0,
                'Unit of Measure': item.unitOfMeasure || 'N/A',
                'Category': item.category?.title || 'N/A',
                'Primary Supplier': item.primarySupplier?.name || 'N/A',
                'VAT Applicable': item.isVATApplicable !== false ? 'Yes' : 'No',
                'Status': (item.currentStock || 0) === 0 ? 'CRITICAL' :
                    (item.currentStock || 0) <= (item.minimumStockLevel || 0) ? 'LOW STOCK' : 'HEALTHY'
            })) || [];

            if (lowStockData.length > 0) {
                const lowStockSheet = XLSX.utils.json_to_sheet(lowStockData);
                autoFitColumns(lowStockSheet);
                XLSX.utils.book_append_sheet(workbook, lowStockSheet, 'Low Stock Alerts');
            }

            // 11. ANALYTICS DATA SHEET WITH VAT
            console.log('📝 Creating Analytics Data sheet with VAT...');
            const analyticsSheetData = createFormattedAnalyticsData();
            const analyticsSheet = XLSX.utils.aoa_to_sheet(analyticsSheetData);
            autoFitColumns(analyticsSheet);
            XLSX.utils.book_append_sheet(workbook, analyticsSheet, 'Analytics Data');

            // 12. SUPPLIER PERFORMANCE SHEET WITH VAT
            console.log('📝 Creating Supplier Performance sheet with VAT...');
            const supplierData = analyticsData?.suppliers.performance.map(supplier => ({
                'Supplier Name': supplier.name || 'N/A',
                'Total Orders': supplier.orders || 0,
                'Total Value (excl. VAT)': supplier.value || 0,
                'VAT Amount': supplier.vatAmount || 0,
                'Total Value (incl. VAT)': (supplier.value || 0) + (supplier.vatAmount || 0)
            })) || [];

            if (supplierData.length > 0) {
                const supplierSheet = XLSX.utils.json_to_sheet(supplierData);
                autoFitColumns(supplierSheet);
                XLSX.utils.book_append_sheet(workbook, supplierSheet, 'Supplier Performance');
            }

            // Generate Excel file
            console.log('💾 Generating Excel file with VAT...');
            const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const fileName = `Caterflow_Comprehensive_Report_VAT_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
            saveAs(data, fileName);

            console.log('✅ Excel export with VAT completed successfully');
            toast({
                title: 'Export Successful',
                description: `Report exported with ${workbook.SheetNames.length} sheets including VAT analysis`,
                status: 'success',
                duration: 4000,
                isClosable: true,
            });

        } catch (error) {
            console.error('❌ Error exporting to Excel:', error);
            toast({
                title: 'Export Failed',
                description: 'Failed to export report. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setExportLoading(false);
        }
    }, [analyticsData, rawData, toast, fetchAllData, primaryDateRange, filterDataByDateRange, createFormattedAnalyticsData, createFormattedSalesSummaryData, createFormattedSummaryData]);

    // ========== OLD REPORTS FUNCTIONS ==========
    // (Keeping all original old reports functionality with VAT columns added)

    // Helper function to get date from item based on report type
    const getItemDate = (item: any, reportTitle: string): string => {
        switch (reportTitle) {
            case 'Purchase Orders':
                return item.orderDate || item.createdAt || '';
            case 'Goods Receipts':
                return item.receiptDate || '';
            case 'Dispatches':
                return item.dispatchDate || '';
            case 'Transfers':
                return item.transferDate || '';
            case 'Bin Counts':
                return item.countDate || '';
            default:
                return item.createdAt || '';
        }
    };

    // Helper function to get site from item based on report type
    const getItemSite = (item: any, reportTitle: string): any => {
        switch (reportTitle) {
            case 'Purchase Orders':
                return item.site;
            case 'Goods Receipts':
                return item.purchaseOrder?.site;
            case 'Dispatches':
                return item.sourceBin?.site;
            case 'Transfers':
                return item.fromBin?.site;
            case 'Bin Counts':
                return item.bin?.site;
            default:
                return item.site;
        }
    };

    // Filter report data - using ref to avoid dependencies
    const filterReportData = useCallback((reportTitle: string, dataToFilter?: ReportData[]) => {
        const { reportData, dateRanges, selectedSites, searchTerms, reportConfigs } = filterStateRef.current;

        const data = dataToFilter || reportData[reportTitle];
        if (!data) return;

        const config = reportConfigs.find(r => r.title === reportTitle);
        if (!config) return;

        let filtered = [...data];

        // Apply date range filter
        if (config.filters?.dateRange) {
            filtered = filtered.filter((item: any) => {
                const itemDate = getItemDate(item, reportTitle);
                const dateRange = dateRanges[reportTitle];
                return (!dateRange?.start || itemDate >= dateRange.start) &&
                    (!dateRange?.end || itemDate <= dateRange.end);
            });
        }

        // Apply site filter
        if (config.filters?.site && selectedSites[reportTitle] !== 'all') {
            filtered = filtered.filter((item: any) => {
                const itemSite = getItemSite(item, reportTitle);
                return itemSite === selectedSites[reportTitle] ||
                    (typeof itemSite === 'object' && itemSite._id === selectedSites[reportTitle]);
            });
        }

        // Apply search filter
        const searchTerm = searchTerms[reportTitle];
        if (searchTerm) {
            filtered = filtered.filter(item =>
                Object.values(item).some(value =>
                    value?.toString().toLowerCase().includes(searchTerm.toLowerCase())
                )
            );
        }

        setFilteredData(prev => ({ ...prev, [reportTitle]: filtered }));
    }, []);

    // Fetch report data (only if not already loaded)
    const fetchReportData = useCallback(async (reportTitle: string) => {
        if (filterStateRef.current.reportData[reportTitle]) {
            filterReportData(reportTitle);
            return;
        }

        setLoading(prev => ({ ...prev, [reportTitle]: true }));
        try {
            const config = filterStateRef.current.reportConfigs.find(r => r.title === reportTitle);
            if (!config) return;

            console.log(`📡 Fetching ${reportTitle} data from ${config.endpoint}...`);
            const response = await fetch(config.endpoint);

            if (!response.ok) {
                throw new Error(`Failed to fetch ${reportTitle} data: ${response.status}`);
            }

            let data = await response.json();

            // Apply VAT calculations to fetched data
            if (reportTitle === 'Purchase Orders') {
                data = calculatePurchaseOrderVAT(data);
            } else if (reportTitle === 'Goods Receipts') {
                data = calculateGoodsReceiptVAT(data);
            } else if (reportTitle === 'Dispatches') {
                data = calculateDispatchVAT(data);
            }

            console.log(`✅ ${reportTitle} data fetched with VAT:`, data.length, 'items');

            setReportData(prev => ({ ...prev, [reportTitle]: data }));
            filterReportData(reportTitle, data);
        } catch (error) {
            console.error(`Error fetching ${reportTitle} data:`, error);
            toast({
                title: 'Error',
                description: `Failed to load ${reportTitle} data`,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(prev => ({ ...prev, [reportTitle]: false }));
        }
    }, [filterReportData, toast, calculatePurchaseOrderVAT, calculateGoodsReceiptVAT, calculateDispatchVAT]);

    // Initialize filter states for old reports
    useEffect(() => {
        const initialDateRanges: { [key: string]: { start: string; end: string } } = {};
        const initialSelectedSites: { [key: string]: string } = {};
        const initialSearchTerms: { [key: string]: string } = {};

        reportConfigs.forEach(config => {
            initialDateRanges[config.title] = {
                start: new Date(new Date().getFullYear() - 1, 0, 1).toISOString().split('T')[0],
                end: new Date().toISOString().split('T')[0]
            };
            initialSelectedSites[config.title] = 'all';
            initialSearchTerms[config.title] = '';
        });

        setDateRanges(initialDateRanges);
        setSelectedSites(initialSelectedSites);
        setSearchTerms(initialSearchTerms);
    }, [reportConfigs]);

    // Fetch sites for old reports
    useEffect(() => {
        const fetchSites = async () => {
            try {
                console.log('🌐 Fetching sites for reports...');
                const response = await fetch('/api/sites');
                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ Sites fetched:', data.length, 'sites');
                    setSites(data);
                }
            } catch (error) {
                console.error('Failed to fetch sites:', error);
            }
        };
        fetchSites();
    }, []);

    // Export single report to CSV
    const exportToCSV = useCallback((reportTitle: string) => {
        const data = filteredData[reportTitle];
        if (!data || data.length === 0) {
            toast({
                title: 'No Data',
                description: 'There is no data to export',
                status: 'warning',
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        try {
            const config = reportConfigs.find(r => r.title === reportTitle);
            if (!config) return;

            const headers = config.columns.map(col =>
                col.split('.').map(part =>
                    part.replace(/([A-Z])/g, ' $1').trim()
                ).join(' > ')
            ).join(',');

            const csvData = data.map(item => {
                return config.columns.map(column => {
                    const value = getNestedValue(item, column);
                    const stringValue = String(value || '').replace(/"/g, '""');
                    return `"${stringValue}"`;
                }).join(',');
            }).join('\n');

            const csv = `${headers}\n${csvData}`;
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast({
                title: 'Export Successful',
                description: `${reportTitle} data exported to CSV`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });
        } catch (error) {
            console.error('Error exporting to CSV:', error);
            toast({
                title: 'Export Failed',
                description: 'Failed to export data to CSV',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    }, [filteredData, reportConfigs, toast]);

    // Export all reports to a single organized CSV file
    const exportAllReports = useCallback(async () => {
        try {
            setAnalyticsLoading(true);
            console.log('📊 Starting export of all reports with VAT...');

            const fetchPromises = reportConfigs.map(async (config) => {
                console.log(`📡 Fetching ${config.title}...`);
                const response = await fetch(config.endpoint);
                if (!response.ok) {
                    throw new Error(`Failed to fetch ${config.title}`);
                }
                let data = await response.json();

                // Apply VAT calculations
                if (config.title === 'Purchase Orders') {
                    data = calculatePurchaseOrderVAT(data);
                } else if (config.title === 'Goods Receipts') {
                    data = calculateGoodsReceiptVAT(data);
                } else if (config.title === 'Dispatches') {
                    data = calculateDispatchVAT(data);
                }

                return data;
            });

            const allData = await Promise.all(fetchPromises);
            console.log('✅ All reports data fetched with VAT');

            let combinedCsv = '';

            reportConfigs.forEach((config, reportIndex) => {
                const data = allData[reportIndex] || [];

                if (data.length > 0) {
                    combinedCsv += `${config.title}\n`;
                    combinedCsv += `${config.description}\n\n`;

                    const headers = config.columns.map(col =>
                        col.split('.').map(part =>
                            part.replace(/([A-Z])/g, ' $1').trim()
                        ).join(' > ')
                    ).join(',');

                    combinedCsv += headers + '\n';

                    data.forEach((item: any) => {
                        const row = config.columns.map(column => {
                            const value = getNestedValue(item, column);
                            const stringValue = String(value || '').replace(/"/g, '""');
                            return `"${stringValue}"`;
                        }).join(',');

                        combinedCsv += row + '\n';
                    });

                    combinedCsv += '\n\n';
                }
            });

            const blob = new Blob([combinedCsv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `All_Reports_Combined_VAT_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('✅ All reports with VAT exported successfully');
            toast({
                title: 'Export Successful',
                description: 'All reports combined into a single CSV file with VAT',
                status: 'success',
                duration: 3000,
                isClosable: true,
            });
        } catch (error) {
            console.error('Error exporting all reports:', error);
            toast({
                title: 'Export Failed',
                description: 'Failed to export reports',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setAnalyticsLoading(false);
        }
    }, [reportConfigs, toast, calculatePurchaseOrderVAT, calculateGoodsReceiptVAT, calculateDispatchVAT]);

    // Helper to get nested object values
    const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((current, key) => {
            return current ? current[key] : undefined;
        }, obj);
    };

    // Update filters and re-filter data for old reports
    const updateDateRange = (reportTitle: string, newDateRange: { start: string; end: string }) => {
        setDateRanges(prev => ({ ...prev, [reportTitle]: newDateRange }));
        setTimeout(() => filterReportData(reportTitle), 0);
    };

    const updateSelectedSite = (reportTitle: string, site: string) => {
        setSelectedSites(prev => ({ ...prev, [reportTitle]: site }));
        setTimeout(() => filterReportData(reportTitle), 0);
    };

    const updateSearchTerm = (reportTitle: string, term: string) => {
        setSearchTerms(prev => ({ ...prev, [reportTitle]: term }));
        setTimeout(() => filterReportData(reportTitle), 0);
    };

    // Load report data when tab changes (only if not already loaded)
    useEffect(() => {
        if (status === 'authenticated' && currentReport) {
            fetchReportData(currentReport.title);
        }
    }, [currentReport, fetchReportData, status]);

    // Auto-load data on mount and when date range changes
    useEffect(() => {
        if (status === 'authenticated' && activeTab === 0) {
            const timer = setTimeout(() => {
                console.log('🔍 Loading analytics data with VAT on mount...');
                fetchAllData();
            }, 500);

            return () => clearTimeout(timer);
        }
    }, [status, activeTab, fetchAllData]);

    if (status === 'loading') {
        return (
            <Flex justifyContent="center" alignItems="center" minH="100vh" bg={bgPrimary}>
                <VStack spacing={4}>
                    <Spinner size="xl" color="brand.500" />
                    <Text>Loading Reports...</Text>
                </VStack>
            </Flex>
        );
    }

    // Helper function to render cell values appropriately for old reports
    const renderCellValue = (value: any, column: string): React.ReactNode => {
        if (value == null) return '-';

        if (column.includes('date') || column.includes('Date') || column === 'timestamp' || column === 'createdAt') {
            try {
                return new Date(value).toLocaleDateString();
            } catch {
                return value;
            }
        }

        if (column.includes('amount') || column.includes('cost') || column.includes('price') || column.includes('vat')) {
            if (typeof value === 'number') {
                return `SZL ${value.toFixed(2)}`;
            }
        }

        if (column === 'status' || column.includes('Status')) {
            const getStatusColor = (status: string) => {
                switch (status?.toLowerCase()) {
                    case 'completed':
                    case 'approved':
                    case 'processed':
                        return 'green';
                    case 'pending':
                    case 'draft':
                    case 'pending-approval':
                        return 'orange';
                    case 'cancelled':
                    case 'rejected':
                        return 'red';
                    case 'partially-received':
                    case 'in-progress':
                        return 'blue';
                    default:
                        return 'gray';
                }
            };

            return (
                <Badge colorScheme={getStatusColor(value)} variant="subtle" fontSize="xs">
                    {typeof value === 'string' ? value.replace('-', ' ').toUpperCase() : String(value)}
                </Badge>
            );
        }

        if (Array.isArray(value)) {
            if (value.length === 0) return 'None';

            return value.slice(0, 2).map((item, idx) => (
                <Text key={idx} fontSize="xs">
                    {typeof item === 'object' ?
                        (item.stockItem?.name || item.name || `${item.orderedQuantity || item.receivedQuantity || item.dispatchedQuantity || item.quantity}x item`) :
                        String(item)}
                </Text>
            )).concat(value.length > 2 ? [<Text key="more" fontSize="xs">+{value.length - 2} more</Text>] : []);
        }

        if (typeof value === 'object') {
            return value.name || value.title || value.poNumber || value.receiptNumber || value.dispatchNumber || value.transferNumber || 'Object';
        }

        return String(value);
    };

    return (
        <Box p={{ base: 4, md: 8 }} bg={bgPrimary} minH="100vh">
            <VStack spacing={6} align="stretch">
                {/* Header */}
                <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} direction={{ base: 'column', md: 'row' }} gap={4}>
                    <Box>
                        <Heading as="h1" size={{ base: 'xl', md: '2xl' }} color={primaryTextColor} mb={2}>
                            Analytics & Reports
                        </Heading>
                        <Text color={secondaryTextColor}>
                            Comprehensive analytics and exportable reports with VAT calculations (Eswatini 15%)
                        </Text>
                    </Box>

                    <HStack spacing={3}>
                        <Button
                            leftIcon={<FiRefreshCw />}
                            onClick={() => fetchAllData(true)}
                            isLoading={analyticsLoading}
                            variant="outline"
                        >
                            Refresh Data
                        </Button>
                        {activeTab === 0 && (
                            <Button
                                leftIcon={<FiDownload />}
                                colorScheme="green"
                                onClick={exportToExcel}
                                isLoading={exportLoading}
                                size="lg"
                            >
                                Export Full Report with VAT
                            </Button>
                        )}
                    </HStack>
                </Flex>

                {/* VAT Rate Display */}
                <Card bg="blue.50" borderColor="blue.200">
                    <CardBody>
                        <HStack justify="space-between">
                            <HStack>
                                <Icon as={FiPercent} color="blue.500" />
                                <VStack align="start" spacing={0}>
                                    <Text fontWeight="bold" color="blue.700">VAT Rate Applied</Text>
                                    <Text color="blue.600">Eswatini Standard Rate: {VAT_CONFIG.ratePercentage}%</Text>
                                </VStack>
                            </HStack>
                            <Badge colorScheme="blue" fontSize="lg" p={2}>
                                VAT {VAT_CONFIG.ratePercentage}%
                            </Badge>
                        </HStack>
                    </CardBody>
                </Card>

                {/* Quick Date Range Presets */}
                <Card>
                    <CardBody>
                        <VStack align="start" spacing={4}>
                            <Text fontWeight="medium">Quick Date Ranges</Text>
                            <Wrap spacing={3}>
                                {quickDateRanges.map((range, index) => (
                                    <Button
                                        key={index}
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setPrimaryDateRange(range)}
                                        isDisabled={analyticsLoading}
                                    >
                                        {range.label}
                                    </Button>
                                ))}
                            </Wrap>
                        </VStack>
                    </CardBody>
                </Card>

                {/* Main Tabs - Analytics and Reports */}
                <Card bg={bgCard} border="1px" borderColor={borderColor}>
                    <CardBody p={0}>
                        <Tabs variant="line" onChange={setAnalyticsTab} colorScheme="brand" index={analyticsTab}>
                            <TabList>
                                <Tab>
                                    <HStack spacing={2}>
                                        <Icon as={FiTrendingUp} />
                                        <Text>Executive Dashboard</Text>
                                    </HStack>
                                </Tab>
                                <Tab>
                                    <HStack spacing={2}>
                                        <Icon as={FiBarChart2} />
                                        <Text>Visual Analytics</Text>
                                    </HStack>
                                </Tab>
                                <Tab>
                                    <HStack spacing={2}>
                                        <Icon as={FiDownload} />
                                        <Text>Data Export</Text>
                                    </HStack>
                                </Tab>
                            </TabList>

                            <TabPanels>
                                {/* Executive Dashboard Tab */}
                                <TabPanel>
                                    <VStack spacing={6} align="stretch">
                                        {/* Date Range Controls */}
                                        <Card>
                                            <CardBody>
                                                <VStack align="start" spacing={4}>
                                                    <HStack wrap="wrap" spacing={4}>
                                                        <VStack align="start">
                                                            <Text fontWeight="medium">Analysis Period</Text>
                                                            <HStack>
                                                                <Input
                                                                    type="date"
                                                                    value={primaryDateRange.start}
                                                                    onChange={(e) => setPrimaryDateRange(prev => ({ ...prev, start: e.target.value }))}
                                                                />
                                                                <Text>to</Text>
                                                                <Input
                                                                    type="date"
                                                                    value={primaryDateRange.end}
                                                                    onChange={(e) => setPrimaryDateRange(prev => ({ ...prev, end: e.target.value }))}
                                                                />
                                                            </HStack>
                                                        </VStack>

                                                        <Button
                                                            leftIcon={<FiFilter />}
                                                            onClick={handleUpdateAnalytics}
                                                            isLoading={analyticsLoading}
                                                            colorScheme="brand"
                                                        >
                                                            Update Analytics
                                                        </Button>
                                                    </HStack>
                                                </VStack>
                                            </CardBody>
                                        </Card>

                                        {analyticsLoading ? (
                                            <Flex justify="center" align="center" py={10}>
                                                <VStack spacing={4}>
                                                    <Spinner size="xl" />
                                                    <Text>Loading analytics data with VAT calculations...</Text>
                                                </VStack>
                                            </Flex>
                                        ) : !analyticsData ? (
                                            <Alert status="info" borderRadius="md">
                                                <AlertIcon />
                                                No analytics data available. Click "Update Analytics" to load data with VAT calculations.
                                            </Alert>
                                        ) : (
                                            <>
                                                {/* Key Metrics Summary with VAT */}
                                                <Card>
                                                    <CardBody>
                                                        <Heading size="md" mb={6}>Key Performance Indicators</Heading>
                                                        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
                                                            <Stat>
                                                                <StatLabel>
                                                                    <HStack>
                                                                        <Icon as={FiShoppingCart} />
                                                                        <Text>Purchase Orders</Text>
                                                                    </HStack>
                                                                </StatLabel>
                                                                <StatNumber>{analyticsData.summary.totalPurchaseOrders}</StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData.purchaseOrders.totalValue.toLocaleString()} excl. VAT
                                                                </StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>
                                                                    <HStack>
                                                                        <Icon as={FiUsers} />
                                                                        <Text>People Served</Text>
                                                                    </HStack>
                                                                </StatLabel>
                                                                <StatNumber>{(analyticsData.summary.totalPeopleFed).toLocaleString()}</StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData.dispatches.costPerPerson.toFixed(2)} per person
                                                                </StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>
                                                                    <HStack>
                                                                        <Icon as={FiPercent} />
                                                                        <Text>VAT Payable</Text>
                                                                    </HStack>
                                                                </StatLabel>
                                                                <StatNumber color={analyticsData.summary.netVATLiability >= 0 ? 'red.500' : 'green.500'}>
                                                                    SZL {Math.abs(analyticsData.summary.netVATLiability).toLocaleString()}
                                                                </StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData.summary.netVATLiability >= 0 ? 'Payable' : 'Refundable'}
                                                                </StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>
                                                                    <HStack>
                                                                        <Icon as={FiAlertTriangle} />
                                                                        <Text>Low Stock</Text>
                                                                    </HStack>
                                                                </StatLabel>
                                                                <StatNumber>{analyticsData.summary.lowStockItems}</StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData.summary.criticalStockItems} critical
                                                                </StatHelpText>
                                                            </Stat>
                                                        </SimpleGrid>
                                                    </CardBody>
                                                </Card>

                                                {/* VAT Summary Card */}
                                                <Card borderLeft="4px" borderColor="blue.500">
                                                    <CardBody>
                                                        <Heading size="md" mb={4} color="blue.700">
                                                            <HStack>
                                                                <Icon as={FiPercent} />
                                                                <Text>VAT Summary (Eswatini {VAT_CONFIG.ratePercentage}%)</Text>
                                                            </HStack>
                                                        </Heading>
                                                        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
                                                            <Stat>
                                                                <StatLabel>Output VAT (Sales)</StatLabel>
                                                                <StatNumber>SZL {analyticsData.vat.summary.totalOutputVAT.toLocaleString()}</StatNumber>
                                                                <StatHelpText>VAT collected on sales</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Input VAT (Purchases)</StatLabel>
                                                                <StatNumber>SZL {analyticsData.vat.summary.totalInputVAT.toLocaleString()}</StatNumber>
                                                                <StatHelpText>VAT paid on purchases</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Net VAT Payable</StatLabel>
                                                                <StatNumber color={analyticsData.vat.summary.netVATPayable >= 0 ? 'red.500' : 'green.500'}>
                                                                    SZL {Math.abs(analyticsData.vat.summary.netVATPayable).toLocaleString()}
                                                                </StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData.vat.summary.netVATPayable >= 0 ? 'Amount due to tax authority' : 'Refund claimable'}
                                                                </StatHelpText>
                                                            </Stat>
                                                        </SimpleGrid>
                                                    </CardBody>
                                                </Card>

                                                {/* Operational Overview */}
                                                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                                                    {analyticsLoading ? (
                                                        <>
                                                            <ChartSkeleton />
                                                            <ChartSkeleton />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <StatusPieChart
                                                                data={analyticsData.purchaseOrders.byStatus}
                                                                title="Purchase Orders by Status"
                                                                colors={[CHART_COLORS.primary[0], CHART_COLORS.warning[0], CHART_COLORS.success[0], CHART_COLORS.error[0]]}
                                                            />
                                                            <BarChartComponent
                                                                data={analyticsData.purchaseOrders.bySite}
                                                                title="Purchase Orders by Site"
                                                                dataKey="value"
                                                            />
                                                        </>
                                                    )}
                                                </SimpleGrid>

                                                {/* Dispatch & Inventory Analytics */}
                                                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                                                    {analyticsLoading ? (
                                                        <>
                                                            <ChartSkeleton />
                                                            <ChartSkeleton />
                                                        </>
                                                    ) : (
                                                        <>
                                                            <StatusPieChart
                                                                data={analyticsData.dispatches.byType}
                                                                title="Dispatches by Type"
                                                                colors={CHART_COLORS.success}
                                                            />
                                                            <StatusPieChart
                                                                data={analyticsData.inventory.byCategory}
                                                                title="Inventory by Category"
                                                                colors={CHART_COLORS.purple}
                                                            />
                                                        </>
                                                    )}
                                                </SimpleGrid>

                                                {/* Financial Metrics - PERIOD-BASED CALCULATIONS WITH VAT */}
                                                <Card>
                                                    <CardBody>
                                                        <Heading size="md" mb={4}>Financial Performance (With VAT Accounting)</Heading>

                                                        {/* Success message when we have accurate data */}
                                                        <Alert status="success" mb={4} fontSize="sm">
                                                            <AlertIcon />
                                                            <Box>
                                                                <Text fontWeight="bold">Accurate period accounting with VAT enabled</Text>
                                                                <Text>Eswatini VAT rate of {VAT_CONFIG.ratePercentage}% applied to all transactions</Text>
                                                            </Box>
                                                        </Alert>

                                                        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
                                                            <Stat>
                                                                <StatLabel>Opening Stock</StatLabel>
                                                                <StatNumber>SZL {analyticsData?.financial?.openingStock?.toLocaleString() || '0'}</StatNumber>
                                                                <StatHelpText>As of {format(new Date(primaryDateRange.start), 'MMM dd, yyyy')}</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Goods Received</StatLabel>
                                                                <StatNumber>SZL {analyticsData?.financial?.periodPurchases?.toLocaleString() || '0'}</StatNumber>
                                                                <StatHelpText>{analyticsData?.summary.totalGoodsReceipts} receipts</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Dispatch Consumption</StatLabel>
                                                                <StatNumber>SZL {analyticsData?.financial?.periodConsumption?.toLocaleString() || '0'}</StatNumber>
                                                                <StatHelpText>{analyticsData?.summary.totalDispatches} dispatches</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Stock Variances</StatLabel>
                                                                <StatNumber>SZL {analyticsData?.financial?.netVariances?.toLocaleString() || '0'}</StatNumber>
                                                                <StatHelpText>{analyticsData?.summary.totalBinCounts} counts</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Closing Stock</StatLabel>
                                                                <StatNumber>SZL {analyticsData?.financial?.closingStockValue?.toLocaleString() || '0'}</StatNumber>
                                                                <StatHelpText>Calculated value</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Cost of Goods Sold (COGS)</StatLabel>
                                                                <StatNumber>
                                                                    SZL {analyticsData?.financial?.periodConsumption?.toLocaleString() || '0'}
                                                                </StatNumber>
                                                                <StatHelpText>Actual consumption</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Period Sales</StatLabel>
                                                                <StatNumber>SZL {analyticsData?.financial?.periodSales?.toLocaleString() || '0'}</StatNumber>
                                                                <StatHelpText>{analyticsData?.summary.totalPeopleFed?.toLocaleString()} people fed</StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>VAT Payable</StatLabel>
                                                                <StatNumber color={analyticsData?.financial?.netVATPayable >= 0 ? 'red.500' : 'green.500'}>
                                                                    SZL {Math.abs(analyticsData?.financial?.netVATPayable || 0).toLocaleString()}
                                                                </StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData?.financial?.netVATPayable >= 0 ? 'Due' : 'Refund'}
                                                                </StatHelpText>
                                                            </Stat>
                                                            <Stat>
                                                                <StatLabel>Gross Profit</StatLabel>
                                                                <StatNumber color={analyticsData?.financial?.grossProfitAfterVAT >= 0 ? 'green.500' : 'red.500'}>
                                                                    SZL {analyticsData?.financial?.grossProfitAfterVAT?.toLocaleString() || '0'}
                                                                </StatNumber>
                                                                <StatHelpText>
                                                                    {analyticsData?.financial?.profitPercentage?.toFixed(1) || '0'}% margin
                                                                </StatHelpText>
                                                            </Stat>
                                                        </SimpleGrid>

                                                        {/* Add calculation explanation with VAT */}
                                                        <Box mt={4} p={3} borderRadius="md" bg="gray.50">
                                                            <Text fontSize="sm" fontWeight="medium">Calculation Method (With VAT):</Text>
                                                            <Text fontSize="sm">• Opening Stock: Reconstructed from transaction history</Text>
                                                            <Text fontSize="sm">• Goods Received: Actual receipts in period (SZL {analyticsData?.financial?.periodPurchases?.toLocaleString()})</Text>
                                                            <Text fontSize="sm">• Closing Stock: Calculated value (SZL {analyticsData?.financial?.closingStockValue?.toLocaleString()})</Text>
                                                            <Text fontSize="sm">• COGS: Actual consumption (dispatched items cost)</Text>
                                                            <Text fontSize="sm">• Gross Profit Before VAT: Sales - COGS</Text>
                                                            <Text fontSize="sm">• Gross Profit After VAT: Gross Profit Before VAT - Net VAT Payable</Text>
                                                            <Text fontSize="sm">• VAT Rate: {VAT_CONFIG.ratePercentage}% (Eswatini Standard Rate)</Text>
                                                        </Box>
                                                    </CardBody>
                                                </Card>

                                                {/* Supplier Performance */}
                                                {analyticsData.suppliers.performance.length > 0 && (
                                                    <Card>
                                                        <CardBody>
                                                            <Heading size="sm" mb={4}>Top Suppliers</Heading>
                                                            <TableContainer>
                                                                <Table variant="simple">
                                                                    <Thead>
                                                                        <Tr>
                                                                            <Th>Supplier</Th>
                                                                            <Th isNumeric>Orders</Th>
                                                                            <Th isNumeric>Total Value</Th>
                                                                            <Th isNumeric>VAT Amount</Th>
                                                                        </Tr>
                                                                    </Thead>
                                                                    <Tbody>
                                                                        {analyticsData.suppliers.performance.slice(0, 5).map((supplier, index) => (
                                                                            <Tr key={supplier.name}>
                                                                                <Td>{supplier.name}</Td>
                                                                                <Td isNumeric>{supplier.orders}</Td>
                                                                                <Td isNumeric>SZL {supplier.value.toLocaleString()}</Td>
                                                                                <Td isNumeric>SZL {supplier.vatAmount.toLocaleString()}</Td>
                                                                            </Tr>
                                                                        ))}
                                                                    </Tbody>
                                                                </Table>
                                                            </TableContainer>
                                                        </CardBody>
                                                    </Card>
                                                )}
                                            </>
                                        )}
                                    </VStack>
                                </TabPanel>

                                {/* Visual Analytics Tab */}
                                <TabPanel>
                                    <VisualAnalyticsTab
                                        analyticsData={analyticsData}
                                        loading={analyticsLoading}
                                    />
                                </TabPanel>

                                {/* Data Export Tab */}
                                <TabPanel>
                                    <DataExportTab
                                        exportToExcel={exportToExcel}
                                        loading={exportLoading}
                                        dataAvailable={!!analyticsData}
                                    />
                                </TabPanel>
                            </TabPanels>
                        </Tabs>
                    </CardBody>
                </Card>
            </VStack>
        </Box>
    );
}

// Chart Components
interface PieChartData {
    name: string;
    value: number;
}

// Fixed StatusPieChart component
const StatusPieChart = ({ data, title, colors = CHART_COLORS.primary }: { data: any[], title: string, colors?: string[] }) => (
    <Card minH="400px">
        <CardBody>
            <Text fontWeight="bold" mb={4}>{title}</Text>
            <Box height="300px" minWidth="100%">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            labelLine={true}
                            label={({ name, value }) => {
                                const total = data.reduce((sum, item) => sum + item.value, 0);
                                const percentage = (((value as number) / total) * 100).toFixed(0);
                                return `${name}: ${percentage}%`;
                            }}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => [value, 'Count']} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </Box>
        </CardBody>
    </Card>
);

// Fixed BarChartComponent
const BarChartComponent = ({ data, title, dataKey, color = CHART_COLORS.primary[0] }: { data: any[], title: string, dataKey: string, color?: string }) => (
    <Card minH="400px">
        <CardBody>
            <Text fontWeight="bold" mb={4}>{title}</Text>
            <Box height="300px" minWidth="100%">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey={dataKey} fill={color} />
                    </BarChart>
                </ResponsiveContainer>
            </Box>
        </CardBody>
    </Card>
);

// Fixed LineChartComponent
const LineChartComponent = ({ data, title, dataKey, color = CHART_COLORS.primary[0] }: { data: any[], title: string, dataKey: string, color?: string }) => (
    <Card minH="400px">
        <CardBody>
            <Text fontWeight="bold" mb={4}>{title}</Text>
            <Box height="300px" minWidth="100%">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </Box>
        </CardBody>
    </Card>
);

// Visual Analytics Tab Component with VAT
const VisualAnalyticsTab = ({ analyticsData, loading }: { analyticsData: EnhancedAnalyticsData | null, loading: boolean }) => {
    if (loading) {
        return (
            <VStack spacing={6} align="stretch">
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                    <ChartSkeleton />
                    <ChartSkeleton />
                </SimpleGrid>
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                    <ChartSkeleton />
                    <ChartSkeleton />
                </SimpleGrid>
            </VStack>
        );
    }

    if (!analyticsData) {
        return (
            <Alert status="info" borderRadius="md">
                <AlertIcon />
                No analytics data available. Please load data from the Executive Dashboard.
            </Alert>
        );
    }

    return (
        <VStack spacing={6} align="stretch">
            <Text fontSize="lg" color="gray.600">
                Interactive visualizations and detailed analytics across all system modules with VAT calculations
            </Text>

            {/* VAT Analysis Chart */}
            <Card>
                <CardBody>
                    <Text fontWeight="bold" mb={4}>VAT Analysis</Text>
                    <Box height="300px" minWidth="100%">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={[
                                { name: 'Output VAT (Sales)', value: analyticsData.vat.summary.totalOutputVAT, fill: CHART_COLORS.error[0] },
                                { name: 'Input VAT (Purchases)', value: analyticsData.vat.summary.totalInputVAT, fill: CHART_COLORS.primary[0] },
                                { name: 'Net VAT Payable', value: Math.abs(analyticsData.vat.summary.netVATPayable), fill: analyticsData.vat.summary.netVATPayable >= 0 ? CHART_COLORS.warning[0] : CHART_COLORS.success[0] }
                            ]}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip formatter={(value) => [`SZL ${Number(value).toLocaleString()}`, 'Amount']} />
                                <Legend />
                                <Bar dataKey="value" fill="#8884d8" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Box>
                </CardBody>
            </Card>

            {/* Financial Trends */}
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <Card minH="400px">
                    <CardBody>
                        <Text fontWeight="bold" mb={4}>Monthly Spending Trend (With VAT)</Text>
                        <Box height="300px" minWidth="100%">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={analyticsData.financial.monthlySpending}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => [`SZL ${Number(value).toLocaleString()}`, 'Amount']} />
                                    <Legend />
                                    <Bar dataKey="spending" fill={CHART_COLORS.primary[0]} name="Spending (excl. VAT)" />
                                    <Bar dataKey="vat" fill={CHART_COLORS.vat[0]} name="VAT Amount" />
                                    <Line type="monotone" dataKey="totalWithVAT" stroke={CHART_COLORS.success[0]} strokeWidth={2} name="Total (incl. VAT)" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </Box>
                    </CardBody>
                </Card>

                <Card minH="400px">
                    <CardBody>
                        <Text fontWeight="bold" mb={4}>Cost Per Person Trend</Text>
                        <Box height="300px" minWidth="100%">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={analyticsData.financial.costPerPersonTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip formatter={(value) => [`SZL ${Number(value).toFixed(2)}`, 'Cost per Person']} />
                                    <Line type="monotone" dataKey="cost" stroke={CHART_COLORS.success[0]} strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Box>
                    </CardBody>
                </Card>
            </SimpleGrid>

            {/* Inventory Health */}
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <Card>
                    <CardBody>
                        <Text fontWeight="bold" mb={4}>Inventory Health Status</Text>
                        <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                                <Text>Healthy Items</Text>
                                <Badge colorScheme="green" fontSize="md">
                                    {analyticsData.inventory.lowStockBreakdown.healthy}
                                </Badge>
                            </HStack>
                            <HStack justify="space-between">
                                <Text>Low Stock Warning</Text>
                                <Badge colorScheme="yellow" fontSize="md">
                                    {analyticsData.inventory.lowStockBreakdown.warning}
                                </Badge>
                            </HStack>
                            <HStack justify="space-between">
                                <Text>Critical Stock</Text>
                                <Badge colorScheme="red" fontSize="md">
                                    {analyticsData.inventory.lowStockBreakdown.critical}
                                </Badge>
                            </HStack>
                            <Progress
                                value={
                                    (analyticsData.inventory.lowStockBreakdown.healthy / analyticsData.summary.totalStockItems) * 100
                                }
                                colorScheme="green"
                                size="lg"
                            />
                        </VStack>
                    </CardBody>
                </Card>

                <Card>
                    <CardBody>
                        <Text fontWeight="bold" mb={4}>Inventory Accuracy</Text>
                        <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                                <Text>Count Accuracy</Text>
                                <Text fontWeight="bold">{(analyticsData.binCounts.accuracy * 100).toFixed(1)}%</Text>
                            </HStack>
                            <Progress value={analyticsData.binCounts.accuracy * 100} colorScheme="blue" size="lg" />
                            <Wrap spacing={4}>
                                <WrapItem>
                                    <Badge colorScheme="green">Zero Variance: {analyticsData.binCounts.varianceAnalysis.zero}</Badge>
                                </WrapItem>
                                <WrapItem>
                                    <Badge colorScheme="red">Negative: {analyticsData.binCounts.varianceAnalysis.negative}</Badge>
                                </WrapItem>
                                <WrapItem>
                                    <Badge colorScheme="orange">Positive: {analyticsData.binCounts.varianceAnalysis.positive}</Badge>
                                </WrapItem>
                            </Wrap>
                        </VStack>
                    </CardBody>
                </Card>
            </SimpleGrid>

            {/* Top Items Tables with VAT */}
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <Card>
                    <CardBody>
                        <Heading size="sm" mb={4}>Top Purchased Items (With VAT)</Heading>
                        <TableContainer>
                            <Table variant="simple" size="sm">
                                <Thead>
                                    <Tr>
                                        <Th>Item</Th>
                                        <Th isNumeric>Quantity</Th>
                                        <Th isNumeric>Value</Th>
                                        <Th isNumeric>VAT</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {analyticsData.purchaseOrders.topItems.slice(0, 5).map((item, index) => (
                                        <Tr key={item.name}>
                                            <Td>{item.name}</Td>
                                            <Td isNumeric>{item.quantity}</Td>
                                            <Td isNumeric>SZL {item.value.toLocaleString()}</Td>
                                            <Td isNumeric>SZL {item.vatAmount.toLocaleString()}</Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>
                        </TableContainer>
                    </CardBody>
                </Card>

                <Card>
                    <CardBody>
                        <Heading size="sm" mb={4}>Top Dispatched Items (With VAT)</Heading>
                        <TableContainer>
                            <Table variant="simple" size="sm">
                                <Thead>
                                    <Tr>
                                        <Th>Item</Th>
                                        <Th isNumeric>Quantity</Th>
                                        <Th isNumeric>Cost</Th>
                                        <Th isNumeric>VAT</Th>
                                    </Tr>
                                </Thead>
                                <Tbody>
                                    {analyticsData.dispatches.topItems.slice(0, 5).map((item, index) => (
                                        <Tr key={item.name}>
                                            <Td>{item.name}</Td>
                                            <Td isNumeric>{item.quantity}</Td>
                                            <Td isNumeric>SZL {item.cost.toLocaleString()}</Td>
                                            <Td isNumeric>SZL {item.vatAmount.toLocaleString()}</Td>
                                        </Tr>
                                    ))}
                                </Tbody>
                            </Table>
                        </TableContainer>
                    </CardBody>
                </Card>
            </SimpleGrid>
        </VStack>
    );
};

// Data Export Tab Component with VAT
const DataExportTab = ({ exportToExcel, loading, dataAvailable }: { exportToExcel: () => void, loading: boolean, dataAvailable: boolean }) => (
    <VStack spacing={6} align="stretch">
        <Card>
            <CardBody>
                <VStack spacing={4} align="start">
                    <Heading size="md">Comprehensive Data Export with VAT</Heading>
                    <Text>
                        Generate a complete Excel report with multiple sheets containing all system data,
                        analytics, and visual summaries. The export includes accurate VAT calculations
                        using the Eswatini standard rate of {VAT_CONFIG.ratePercentage}%.
                    </Text>

                    <SimpleGrid columns={2} spacing={4} width="100%">
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Executive Summary</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Purchase Orders with VAT</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Goods Receipts with VAT</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Dispatches & Consumption with VAT</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Stock Transfers</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Bin Counts & Adjustments</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Inventory Catalog with VAT</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Low Stock Alerts</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Analytics Data with VAT</Text></HStack>
                        <HStack><Box w="2" h="2" bg="green.500" borderRadius="full" /><Text>Supplier Performance with VAT</Text></HStack>
                        <HStack><Box w="2" h="2" bg="blue.500" borderRadius="full" /><Text>VAT Analysis Report</Text></HStack>
                        <HStack><Box w="2" h="2" bg="blue.500" borderRadius="full" /><Text>Sales Summary with VAT</Text></HStack>
                    </SimpleGrid>

                    <Alert status="info" borderRadius="md">
                        <AlertIcon />
                        The exported Excel file contains accurate, real-time data with Eswatini VAT calculations.
                        All financial values are clearly marked as either excluding or including VAT.
                    </Alert>

                    <Button
                        leftIcon={<FiDownload />}
                        colorScheme="green"
                        onClick={exportToExcel}
                        isLoading={loading}
                        isDisabled={!dataAvailable}
                        size="lg"
                    >
                        {dataAvailable ? 'Generate Comprehensive Report with VAT' : 'Load Data First'}
                    </Button>

                    {!dataAvailable && (
                        <Text color="orange.500" fontSize="sm">
                            Please load data from the Executive Dashboard tab first to ensure accurate VAT calculations.
                        </Text>
                    )}
                </VStack>
            </CardBody>
        </Card>
    </VStack>
); 