// src/components/DataTable.tsx
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
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ChevronDownIcon } from '@chakra-ui/icons';
import { FiPackage } from 'react-icons/fi';
import { PendingAction } from '@/app/actions/types';

// Define a flexible column type for better control over rendering
export interface Column {
    accessorKey: string;
    header: string | React.ReactNode;
    cell?: (row: any, index?: number) => React.ReactNode;
    isSortable?: boolean;
}

interface DataTableProps {
    columns: Column[];
    data: any[];
    loading: boolean;
    onActionClick?: (action: PendingAction) => void;
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
    const [selectedRows, setSelectedRows] = useState<any[]>([]);

    const filteredData = useMemo(() => {
        if (!searchTerm) {
            return data;
        }
        return data.filter(row =>
            columns.some(column => {
                const value = row[column.accessorKey];
                if (typeof value === 'string') {
                    return value.toLowerCase().includes(searchTerm.toLowerCase());
                }
                return false;
            })
        );
    }, [data, searchTerm, columns]);

    const sortedData = useMemo(() => {
        if (!sortColumn || !sortDirection) {
            return filteredData;
        }

        return [...filteredData].sort((a, b) => {
            const aValue = a[sortColumn];
            const bValue = b[sortColumn];

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortDirection === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }
            return 0;
        });
    }, [filteredData, sortColumn, sortDirection]);

    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return sortedData.slice(startIndex, endIndex);
    }, [sortedData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    const handleSort = (accessorKey: string) => {
        if (sortColumn === accessorKey) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(accessorKey);
            setSortDirection('asc');
        }
    };

    const handlePreviousPage = () => {
        setCurrentPage(prev => Math.max(prev - 1, 1));
    };

    const handleNextPage = () => {
        setCurrentPage(prev => Math.min(prev + 1, totalPages));
    };

    const handleItemsPerPageChange = (e: ChangeEvent<HTMLSelectElement>) => {
        setItemsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    const handleSelectAll = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedRows(paginatedData);
            if (onSelectionChange) {
                onSelectionChange(paginatedData);
            }
        } else {
            setSelectedRows([]);
            if (onSelectionChange) {
                onSelectionChange([]);
            }
        }
    };

    const handleSelectRow = (row: any) => {
        let newSelectedRows;
        if (selectedRows.includes(row)) {
            newSelectedRows = selectedRows.filter(r => r !== row);
        } else {
            newSelectedRows = [...selectedRows, row];
        }
        setSelectedRows(newSelectedRows);
        if (onSelectionChange) {
            onSelectionChange(newSelectedRows);
        }
    };

    return (
        <Box
            className="data-table-container"
            overflowX="auto"
        >
            <Flex mb={4} justifyContent="space-between" alignItems="center" flexWrap="wrap">
                <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    maxW={{ base: '100%', md: '300px' }}
                    mb={{ base: 2, md: 0 }}
                />
            </Flex>

            {loading ? (
                <Flex justifyContent="center" py={10}>
                    <Spinner size="xl" />
                </Flex>
            ) : (
                <Table variant="simple" size="sm">
                    <Thead>
                        <Tr>
                            {onSelectionChange && (
                                <Th>
                                    <Checkbox
                                        onChange={handleSelectAll}
                                        isChecked={selectedRows.length === paginatedData.length && paginatedData.length > 0}
                                        isIndeterminate={selectedRows.length > 0 && selectedRows.length < paginatedData.length}
                                    />
                                </Th>
                            )}
                            {columns.map(column => (
                                <Th key={column.accessorKey}>
                                    <HStack
                                        spacing={1}
                                        cursor={column.isSortable ? 'pointer' : 'default'}
                                        onClick={() => column.isSortable && handleSort(column.accessorKey)}
                                    >
                                        <Text>{column.header}</Text>
                                        {column.isSortable && (
                                            <chakra.span>
                                                {sortColumn === column.accessorKey && sortDirection === 'asc' && <ChevronUpIcon />}
                                                {sortColumn === column.accessorKey && sortDirection === 'desc' && <ChevronDownIcon />}
                                            </chakra.span>
                                        )}
                                    </HStack>
                                </Th>
                            ))}
                            {onActionClick && (
                                <Th>Actions</Th>
                            )}
                        </Tr>
                    </Thead>
                    <Tbody>
                        {paginatedData.length > 0 ? (
                            paginatedData.map((row, index) => (
                                <Tr key={row._id || row._key || index}>
                                    {onSelectionChange && (
                                        <Td>
                                            <Checkbox
                                                onChange={() => handleSelectRow(row)}
                                                isChecked={selectedRows.includes(row)}
                                            />
                                        </Td>
                                    )}
                                    {columns.map(column => (
                                        <Td key={column.accessorKey}>
                                            {column.cell ? column.cell(row, index) : row[column.accessorKey]}
                                        </Td>
                                    ))}
                                    {onActionClick && (
                                        <Td>
                                            <Button size="sm" onClick={() => onActionClick(row)}>View</Button>
                                        </Td>
                                    )}
                                </Tr>
                            ))
                        ) : (
                            <Tr>
                                <Td colSpan={onSelectionChange ? columns.length + 1 : columns.length}>
                                    No data available.
                                </Td>
                            </Tr>
                        )}
                    </Tbody>
                </Table>
            )}

            <Flex mt={4} justifyContent="space-between" alignItems="center">
                <HStack spacing={2} display={{ base: 'none', sm: 'flex' }}>
                    <Text fontSize="sm">Show</Text>
                    <Select value={itemsPerPage} onChange={handleItemsPerPageChange} size="sm" width="70px">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                    </Select>
                    <Text fontSize="sm">entries</Text>
                </HStack>
                <Text fontSize="sm" className="font-medium text-gray-600">
                    Showing {paginatedData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} entries
                </Text>
                <HStack spacing={2}>
                    <IconButton
                        aria-label="Previous page"
                        icon={<ChevronLeftIcon />}
                        onClick={handlePreviousPage}
                        isDisabled={currentPage === 1}
                        size="sm"
                        variant="outline"
                        rounded="md"
                    />
                    <Text fontSize="sm" className="font-medium text-gray-600">
                        Page {totalPages === 0 ? 0 : currentPage} of {totalPages === 0 ? 0 : totalPages}
                    </Text>
                    <IconButton
                        aria-label="Next page"
                        icon={<ChevronRightIcon />}
                        onClick={handleNextPage}
                        isDisabled={currentPage === totalPages || totalPages === 0}
                        size="sm"
                        variant="outline"
                        rounded="md"
                    />
                </HStack>
            </Flex>
        </Box>
    );
}