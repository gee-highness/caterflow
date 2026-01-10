'use client';
import React, { useState, useMemo, ChangeEvent } from 'react';
import {
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Box,
    Input,
    Flex,
    Button,
    Text,
    IconButton,
    HStack,
    Select,
    chakra,
    Spinner,
    Checkbox,
    Badge,
    useColorModeValue,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon } from '@chakra-ui/icons';
import { FiPackage } from 'react-icons/fi';
import { PendingAction } from '@/app/actions/types'; // Assuming this type is available

// Define a flexible column type for better control over rendering
export interface Column {
    accessorKey: keyof PendingAction | string; // Use keyof PendingAction for type safety
    header: string | React.ReactNode;
    cell?: (row: any, index?: number) => React.ReactNode;
    isSortable?: boolean;
}

interface DataTableProps {
    columns: Column[];
    data: any[];
    loading: boolean;
    onActionClick?: (action: any) => void;
    hideStatusColumn?: boolean;
    actionType?: string;
    onSelectionChange?: (selectedItems: any[]) => void;
}

export default function DataTable({
    columns,
    data,
    loading,
    onActionClick,
    hideStatusColumn = false,
    actionType = '',
    onSelectionChange,
}: DataTableProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

    // Theme colors
    const tableBg = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const headerBg = useColorModeValue('neutral.light.bg-card-hover', 'neutral.dark.bg-card-hover');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const inputBg = useColorModeValue('neutral.light.bg-input', 'neutral.dark.bg-input');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const hoverBg = useColorModeValue('neutral.light.bg-card-hover', 'neutral.dark.bg-card-hover');
    const actionButtonColor = useColorModeValue('brand.light', 'brand.dark');

    // Selection handlers
    const handleRowSelection = (id: string) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedRows(newSelected);
        onSelectionChange?.(data.filter(item => newSelected.has(item._id)));
    };

    // Add select all handler
    const handleSelectAll = () => {
        const allIds = new Set(data.map(item => item._id));
        if (selectedRows.size === allIds.size) {
            setSelectedRows(new Set());
            onSelectionChange?.([]);
        } else {
            setSelectedRows(allIds);
            onSelectionChange?.(data);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'draft': return 'gray';
            case 'pending': return 'orange';
            case 'in-progress': return 'blue';
            case 'completed': return 'green';
            case 'pending-approval': return 'purple';
            default: return 'gray';
        }
    };

    // Custom action button renderer based on action type
    const renderActionButton = (row: any) => {
        if (!onActionClick) return null;

        if (actionType === 'GoodsReceipt') {
            return (
                <Button
                    size="sm"
                    colorScheme="green"
                    onClick={() => onActionClick(row)}
                    leftIcon={<FiPackage />}
                >
                    Receive
                </Button>
            );
        } else {
            return (
                <Button
                    size="sm"
                    colorScheme="blue"
                    onClick={() => onActionClick(row)}
                >
                    View
                </Button>
            );
        }
    };

    // Improved search function that recursively searches all properties
    const searchAllData = (row: any, searchTerm: string): boolean => {
        if (!searchTerm.trim()) return true;

        const searchTermLower = searchTerm.toLowerCase();

        // Recursive function to search through all object properties
        const searchObject = (obj: any): boolean => {
            if (obj === null || obj === undefined) return false;

            // Handle primitive values
            if (typeof obj === 'string') {
                return obj.toLowerCase().includes(searchTermLower);
            }

            if (typeof obj === 'number') {
                return obj.toString().includes(searchTerm);
            }

            if (typeof obj === 'boolean') {
                return obj.toString().toLowerCase().includes(searchTermLower);
            }

            // Handle Date objects
            if (obj instanceof Date) {
                return obj.toLocaleDateString().toLowerCase().includes(searchTermLower);
            }

            // Handle arrays - search through each element
            if (Array.isArray(obj)) {
                return obj.some(item => searchObject(item));
            }

            // Handle objects - search through all properties
            if (typeof obj === 'object') {
                return Object.values(obj).some(value => searchObject(value));
            }

            return false;
        };

        return searchObject(row);
    };

    const processedData = useMemo(() => {
        // 1. Filter Data
        const filtered = data.filter((row) => searchAllData(row, searchTerm));

        // 2. Sort Data
        if (sortColumn && sortDirection) {
            filtered.sort((a, b) => {
                // Enhanced property access to handle nested objects
                const getNestedValue = (obj: any, path: string) => {
                    return path.split('.').reduce((current, key) => current?.[key], obj);
                };

                const aValue = getNestedValue(a, sortColumn);
                const bValue = getNestedValue(b, sortColumn);

                // Handle null/undefined values
                if (aValue == null) return sortDirection === 'asc' ? 1 : -1;
                if (bValue == null) return sortDirection === 'asc' ? -1 : 1;

                // Handle string comparison
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortDirection === 'asc'
                        ? aValue.localeCompare(bValue)
                        : bValue.localeCompare(aValue);
                }

                // Handle number comparison
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                }

                // Handle date comparison
                if (aValue instanceof Date && bValue instanceof Date) {
                    return sortDirection === 'asc'
                        ? aValue.getTime() - bValue.getTime()
                        : bValue.getTime() - aValue.getTime();
                }

                // Handle string dates
                const aDate = new Date(aValue);
                const bDate = new Date(bValue);
                if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
                    return sortDirection === 'asc'
                        ? aDate.getTime() - bDate.getTime()
                        : bDate.getTime() - aDate.getTime();
                }

                // Fallback: convert to string and compare
                return sortDirection === 'asc'
                    ? String(aValue).localeCompare(String(bValue))
                    : String(bValue).localeCompare(String(aValue));
            });
        }
        return filtered;
    }, [data, searchTerm, sortColumn, sortDirection]);

    const totalPages = Math.ceil(processedData.length / itemsPerPage);
    const paginatedData = processedData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    const handleNextPage = () => handlePageChange(currentPage + 1);
    const handlePreviousPage = () => handlePageChange(currentPage - 1);

    const handleSort = (column: string, isSortable: boolean | undefined) => {
        if (!isSortable) return;
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
        // Reset to first page when sorting
        setCurrentPage(1);
    };

    const renderSortIcon = (accessorKey: string) => {
        if (sortColumn !== accessorKey) return null;
        return sortDirection === 'asc' ? (
            <ChevronUpIcon ml={1} />
        ) : (
            <ChevronDownIcon ml={1} />
        );
    };

    // The 'action' and 'status' columns are now handled entirely by the parent component.
    const allColumns = columns;

    return (
        <Box
            p={{ base: 2, md: 4 }}
            borderRadius="md"
            borderWidth="1px"
            bg={tableBg}
            boxShadow="sm"
            sx={{ _dark: { boxShadow: 'dark-sm' } }}
        >
            <Flex
                direction={{ base: 'column', md: 'row' }}
                gap={{ base: 4, md: 8 }}
                mb={6}
                justifyContent="space-between"
                alignItems="center"
                p={4}
                borderWidth="1px"
                borderRadius="md"
                borderColor={borderColor}
            >
                <Input
                    placeholder="Search across all data..."
                    value={searchTerm}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1); // Reset to first page on search
                    }}
                    flex={{ base: '1', md: '0.6' }}
                    bg={tableBg}
                    color={primaryTextColor}
                    _placeholder={{ color: secondaryTextColor }}
                    borderColor={borderColor}
                />
                <HStack
                    spacing={4}
                    alignItems="center"
                    mt={{ base: 4, md: 0 }}
                    flex={{ base: '1', md: '0.4' }}
                >
                    <Text flexShrink={0} fontSize="sm" color={secondaryTextColor}>
                        Items per page:
                    </Text>
                    <Select
                        value={itemsPerPage}
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1); // Reset to first page
                        }}
                        maxW="100px"
                        size="sm"
                        bg={tableBg}
                        borderColor={borderColor}
                    >
                        {[5, 10, 25, 50].map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </Select>
                </HStack>
            </Flex>

            {loading ? (
                <Flex justifyContent="center" alignItems="center" py={10}>
                    <Spinner size="xl" />
                </Flex>
            ) : (
                <Box overflowX="auto">
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr bg={headerBg}>
                                {/* Checkbox column - only show if onSelectionChange is provided */}
                                {onSelectionChange && (
                                    <Th width="50px" borderColor={borderColor}>
                                        <Checkbox
                                            onChange={handleSelectAll}
                                            isChecked={selectedRows.size === data.length}
                                            isIndeterminate={selectedRows.size > 0 && selectedRows.size < data.length}
                                        />
                                    </Th>
                                )}
                                {columns.map((column) => (
                                    <Th
                                        key={column.accessorKey}
                                        onClick={() => handleSort(column.accessorKey, column.isSortable)}
                                        cursor={column.isSortable ? 'pointer' : 'default'}
                                        _hover={{
                                            bg: column.isSortable ? hoverBg : headerBg,
                                        }}
                                        borderColor={borderColor}
                                        color={primaryTextColor}
                                        userSelect="none"
                                    >
                                        <Flex alignItems="center">
                                            {column.header}
                                            {renderSortIcon(column.accessorKey)}
                                        </Flex>
                                    </Th>
                                ))}
                            </Tr>
                        </Thead>
                        <Tbody>
                            {paginatedData.length > 0 ? (
                                paginatedData.map((row, rowIndex) => (
                                    <Tr key={`${row._id}-${row.binName}`} _hover={{ bg: hoverBg }} borderBottomWidth="1px" borderColor={borderColor}>
                                        {/* Selection checkbox - only show if onSelectionChange is provided */}
                                        {onSelectionChange && (
                                            <Td borderColor={borderColor}>
                                                <Checkbox
                                                    onChange={() => handleRowSelection(row._id)}
                                                    isChecked={selectedRows.has(row._id)}
                                                />
                                            </Td>
                                        )}
                                        {columns.map((column) => (
                                            <Td
                                                key={column.accessorKey}
                                                color={primaryTextColor}
                                                borderColor={borderColor}
                                            >
                                                {column.cell ? (
                                                    column.cell(row)
                                                ) : (
                                                    <Text>
                                                        {(() => {
                                                            // Handle nested property access
                                                            const value = column.accessorKey.includes('.')
                                                                ? column.accessorKey.split('.').reduce((obj, key) => obj?.[key], row)
                                                                : row[column.accessorKey];
                                                            return value ?? '-';
                                                        })()}
                                                    </Text>
                                                )}
                                            </Td>
                                        ))}
                                    </Tr>
                                ))
                            ) : (
                                <Tr>
                                    <Td
                                        colSpan={columns.length + (onSelectionChange ? 1 : 0)}
                                        textAlign="center"
                                        py={10}
                                        color={secondaryTextColor}
                                        borderColor={borderColor}
                                    >
                                        No results found.
                                    </Td>
                                </Tr>
                            )}
                        </Tbody>
                    </Table>
                </Box>
            )}

            {/* Pagination Controls */}
            <Flex justifyContent="space-between" alignItems="center" mt={4} px={2} direction={{ base: 'column', md: 'row' }}>
                <Text fontSize="sm" color={secondaryTextColor} mb={{ base: 2, md: 0 }}>
                    Showing {paginatedData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, processedData.length)} of {processedData.length} entries
                </Text>
                <HStack spacing={2}>
                    <IconButton
                        aria-label="Previous page"
                        icon={<ChevronLeftIcon />}
                        onClick={handlePreviousPage}
                        isDisabled={currentPage === 1}
                        size="sm"
                        variant="outline"
                        borderColor={borderColor}
                        color={secondaryTextColor}
                        _hover={{ bg: hoverBg }}
                        rounded="md"
                    />
                    <Text fontSize="sm" color={secondaryTextColor}>
                        Page {totalPages === 0 ? 0 : currentPage} of {totalPages === 0 ? 0 : totalPages}
                    </Text>
                    <IconButton
                        aria-label="Next page"
                        icon={<ChevronRightIcon />}
                        onClick={handleNextPage}
                        isDisabled={currentPage === totalPages || totalPages === 0}
                        size="sm"
                        variant="outline"
                        borderColor={borderColor}
                        color={secondaryTextColor}
                        _hover={{ bg: hoverBg }}
                        rounded="md"
                    />
                </HStack>
            </Flex>
        </Box >
    );
}