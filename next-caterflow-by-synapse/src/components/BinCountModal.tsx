// src/components/BinCountModal.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Button,
    FormControl,
    FormLabel,
    Input,
    useToast,
    VStack,
    HStack,
    IconButton,
    Text,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Box,
    Icon,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    Badge,
    Heading,
    Card,
    CardBody,
    useColorModeValue,
    Divider,
} from '@chakra-ui/react';
import { FiPlus, FiTrash2, FiSearch, FiCheck, FiSave } from 'react-icons/fi';
import BinSelectorModal from './BinSelectorModal';
import StockItemSelectorModal from './StockItemSelectorModal';
import { useSession } from 'next-auth/react';
import { nanoid } from 'nanoid';
import { StockItem } from '@/lib/sanityTypes';

interface CountedItem {
    stockItem: {
        _id: string;
        name: string;
        sku: string
    };
    countedQuantity: number;
    systemQuantityAtCountTime?: number;
    variance?: number;
    _key?: string;
}

interface StockItemForSelector {
    _id: string;
    name: string;
    sku: string;
    itemType: 'food' | 'nonFood';
    unitOfMeasure: string;
    description?: string;
    category?: {
        _id: string;
        title: string;
    };
}

interface Bin {
    _id: string;
    name: string;
    site: {
        _id: string;
        name: string;
    };
}

interface BinCount {
    _id: string;
    countNumber: string;
    countDate: string;
    status: 'draft' | 'in-progress' | 'completed' | 'adjusted';
    bin: Bin;
    countedBy?: {
        _id: string;
        name: string;
    };
    countedItems: CountedItem[];
    notes?: string;
}

interface BinCountModalProps {
    isOpen: boolean;
    onClose: () => void;
    binCount: BinCount | null;
    onSave: () => void;
}

export default function BinCountModal({ isOpen, onClose, binCount, onSave }: BinCountModalProps) {
    const { data: session } = useSession();
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isBinModalOpen, setIsBinModalOpen] = useState(false);
    const [isStockItemModalOpen, setIsStockItemModalOpen] = useState(false);
    const [selectedBin, setSelectedBin] = useState<Bin | null>(null);
    const [countDate, setCountDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');
    const [countedItems, setCountedItems] = useState<CountedItem[]>([]);

    const isViewMode = binCount?.status === 'completed' || binCount?.status === 'adjusted';

    // Theme-aware colors
    const cardBg = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const modalBg = useColorModeValue('neutral.light.bg-secondary', 'neutral.dark.bg-secondary');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const tableHeaderBg = useColorModeValue('neutral.100', 'neutral.700');
    const tableHeaderText = useColorModeValue('neutral.700', 'neutral.200');

    const countedItemIds = useMemo(() => {
        return countedItems.map(item => item.stockItem._id);
    }, [countedItems]);

    // Single optimized useEffect for initial setup
    useEffect(() => {
        if (!isOpen) return; // Only run when modal is open

        if (binCount) {
            setSelectedBin(binCount.bin || null);
            setCountDate(new Date(binCount.countDate).toISOString().split('T')[0]);
            setNotes(binCount.notes || '');

            // Process countedItems with proper validation
            const validCountedItems = (binCount.countedItems || [])
                .filter(item => item && item.stockItem)
                .map(item => ({
                    ...item,
                    _key: item._key || nanoid(),
                    stockItem: {
                        _id: item.stockItem._id,
                        name: item.stockItem.name || 'Unknown Item',
                        sku: item.stockItem.sku || 'N/A'
                    }
                }));
            setCountedItems(validCountedItems);
        } else {
            setSelectedBin(null);
            setCountDate(new Date().toISOString().split('T')[0]);
            setNotes('');
            setCountedItems([]);
        }
    }, [isOpen, binCount, isViewMode]);

    // Optimized system quantities useEffect
    useEffect(() => {
        const fetchSystemQuantities = async () => {
            // Only fetch for draft counts with items and selected bin
            if (binCount && !isViewMode && selectedBin && countedItems.length > 0) {
                setLoading(true);
                try {
                    const updatedItems = await Promise.all(
                        countedItems.map(async (item) => {
                            // Only fetch if systemQuantityAtCountTime is missing AND we have valid IDs
                            if ((typeof item.systemQuantityAtCountTime === 'undefined' ||
                                item.systemQuantityAtCountTime === null) &&
                                item.stockItem._id && selectedBin._id) {

                                try {
                                    const systemQuantityRes = await fetch(
                                        `/api/stock-items/${item.stockItem._id}/in-bin/${selectedBin._id}`
                                    );
                                    if (systemQuantityRes.ok) {
                                        const { inStock } = await systemQuantityRes.json();
                                        return { ...item, systemQuantityAtCountTime: inStock || 0 };
                                    }
                                } catch (error) {
                                    console.error(`Error fetching quantity for ${item.stockItem.name}:`, error);
                                }
                            }
                            return item; // Return unchanged if no fetch needed
                        })
                    );

                    // Only update if items actually changed
                    const hasChanges = updatedItems.some((newItem, index) =>
                        newItem.systemQuantityAtCountTime !== countedItems[index]?.systemQuantityAtCountTime
                    );

                    if (hasChanges) {
                        setCountedItems(updatedItems);
                    }
                } catch (error) {
                    console.error("Error fetching system quantities:", error);
                    toast({
                        title: 'Error',
                        description: 'Failed to load system quantities for some items.',
                        status: 'error',
                        duration: 5000,
                        isClosable: true,
                    });
                } finally {
                    setLoading(false);
                }
            }
        };

        // Add a small delay to prevent rapid successive calls
        const timer = setTimeout(fetchSystemQuantities, 100);
        return () => clearTimeout(timer);
    }, [binCount, isViewMode, selectedBin, countedItems, toast]); // ADD countedItems and toast to dependencies

    // Cleanup effect
    useEffect(() => {
        return () => {
            // Reset state when component unmounts or modal closes
            if (!isOpen) {
                setSelectedBin(null);
                setCountDate(new Date().toISOString().split('T')[0]);
                setNotes('');
                setCountedItems([]);
                setIsProcessing(false);
            }
        };
    }, [isOpen]);

    // Add this function inside the BinCountModal component
    const loadAllStockItems = useCallback(async () => {
        if (!selectedBin || binCount) return; // Only for new counts with selected bin

        setLoading(true);
        try {
            // Fetch all stock items
            const response = await fetch('/api/stock-items');
            if (!response.ok) throw new Error('Failed to fetch stock items');

            const allStockItems: StockItemForSelector[] = await response.json();

            if (allStockItems.length === 0) {
                toast({
                    title: 'No Stock Items',
                    description: 'No stock items found in the system.',
                    status: 'info',
                    duration: 3000,
                    isClosable: true,
                });
                return;
            }

            // Fetch system quantities for all items in parallel
            const itemsWithQuantities = await Promise.all(
                allStockItems.map(async (item) => {
                    let systemQuantity = 0;
                    try {
                        const systemQuantityRes = await fetch(
                            `/api/stock-items/${item._id}/in-bin/${selectedBin._id}`
                        );
                        if (systemQuantityRes.ok) {
                            const { inStock } = await systemQuantityRes.json();
                            systemQuantity = inStock || 0;
                        }
                    } catch (error) {
                        console.warn(`Could not fetch system quantity for ${item.name}:`, error);
                    }

                    return {
                        _key: nanoid(),
                        stockItem: {
                            _id: item._id,
                            name: item.name,
                            sku: item.sku || 'N/A'
                        },
                        countedQuantity: 0,
                        systemQuantityAtCountTime: systemQuantity,
                    };
                })
            );

            setCountedItems(itemsWithQuantities);

            toast({
                title: 'All Items Loaded',
                description: `${itemsWithQuantities.length} stock items added to bin count`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

        } catch (error: any) {
            console.error("Error loading all stock items:", error);
            toast({
                title: 'Error',
                description: 'Failed to load all stock items. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    }, [selectedBin, binCount, toast]);


    // Update the useEffect that handles bin selection
    useEffect(() => {
        if (selectedBin && !binCount) {
            // Auto-load all stock items when a bin is selected for new counts
            const timer = setTimeout(() => {
                loadAllStockItems();
            }, 500); // Small delay to prevent rapid calls

            return () => clearTimeout(timer);
        }
    }, [selectedBin, binCount, loadAllStockItems]);

    const fixBrokenBinCount = async (countId: string) => {
        if (isProcessing) return;

        setIsProcessing(true);
        try {
            // Fetch the broken count using the main GET endpoint and find it
            const response = await fetch('/api/bin-counts');
            if (!response.ok) throw new Error('Failed to fetch bin counts');

            const allCounts = await response.json();
            const brokenCount = allCounts.find((count: any) => count._id === countId);

            if (!brokenCount) {
                toast({
                    title: 'Bin Count Not Found',
                    description: 'The bin count you are trying to fix was not found.',
                    status: 'warning',
                    duration: 5000,
                    isClosable: true,
                });
                return;
            }

            // Construct a clean, valid payload for the Sanity PUT request
            const fixedPayload = {
                countNumber: brokenCount.countNumber,
                countDate: brokenCount.countDate,
                bin: brokenCount.bin._id,
                notes: brokenCount.notes,
                status: brokenCount.status,
                countedItems: (brokenCount.countedItems || [])
                    .filter((item: any) => item && item.stockItem)
                    .map((item: any) => ({
                        _key: item._key,
                        stockItem: item.stockItem._id,
                        countedQuantity: item.countedQuantity,
                        systemQuantityAtCountTime: item.systemQuantityAtCountTime,
                        variance: item.variance,
                    })),
            };

            // Save the fixed count
            const saveResponse = await fetch('/api/bin-counts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _id: countId, ...fixedPayload }),
            });

            if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                throw new Error(errorData.error || 'Failed to save fixed count');
            }

            toast({
                title: 'Count Fixed',
                description: 'The bin count has been fixed successfully.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });

            onSave();
        } catch (error: any) {
            console.error('Error fixing bin count:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to fix the bin count.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBinSelect = (bin: Bin) => {
        setSelectedBin(bin);
        setIsBinModalOpen(false);

        // Don't auto-load if we're editing an existing count
        if (!binCount) {
            // The useEffect above will handle the auto-loading
        }
    };

    // In BinCountModal.tsx - Update the handleStockItemsSelect function
    const handleStockItemsSelect = async (items: StockItemForSelector[]) => {
        setIsStockItemModalOpen(false);

        if (!selectedBin) {
            toast({
                title: "No Bin Selected",
                description: "Please select a bin before adding items.",
                status: "warning",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        // Filter out duplicates
        const existingItemIds = new Set(countedItems.map(i => i.stockItem._id));
        const newItems = items.filter(item => !existingItemIds.has(item._id));

        if (newItems.length === 0) {
            toast({
                title: "All items already added",
                description: "The selected items are already in your bin count.",
                status: "warning",
                duration: 3000,
                isClosable: true,
            });
            return;
        }

        setLoading(true);

        try {
            // Fetch system quantities for all new items in parallel
            const itemsWithQuantities = await Promise.all(
                newItems.map(async (item) => {
                    let systemQuantity = 0;
                    try {
                        const systemQuantityRes = await fetch(
                            `/api/stock-items/${item._id}/in-bin/${selectedBin._id}`
                        );
                        if (systemQuantityRes.ok) {
                            const { inStock } = await systemQuantityRes.json();
                            systemQuantity = inStock || 0;
                        }
                    } catch (error) {
                        console.warn(`Could not fetch system quantity for ${item.name}:`, error);
                    }

                    return {
                        _key: nanoid(),
                        stockItem: {
                            _id: item._id,
                            name: item.name,
                            sku: item.sku || 'N/A'
                        },
                        countedQuantity: 0,
                        systemQuantityAtCountTime: systemQuantity,
                    };
                })
            );

            setCountedItems(prev => [...prev, ...itemsWithQuantities]);

            if (itemsWithQuantities.length < items.length) {
                toast({
                    title: 'Some items skipped',
                    description: `${items.length - itemsWithQuantities.length} items were already in the count`,
                    status: 'info',
                    duration: 3000,
                    isClosable: true,
                });
            } else {
                toast({
                    title: 'Items added',
                    description: `${itemsWithQuantities.length} items added to bin count`,
                    status: 'success',
                    duration: 2000,
                    isClosable: true,
                });
            }

        } catch (error: any) {
            console.error("Error adding stock items:", error);
            toast({
                title: 'Error',
                description: 'Failed to add items. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCountedQuantityChange = (key: string, value: string) => {
        const valueAsNumber = value === '' ? 0 : parseFloat(value);
        setCountedItems(prev => prev.map(item =>
            item._key === key ? {
                ...item,
                countedQuantity: isNaN(valueAsNumber) ? 0 : valueAsNumber
            } : item
        ));
    };

    const handleRemoveItem = (key: string) => {
        setCountedItems(prev => prev.filter(item => item._key !== key));
    };

    const totalVariance = useMemo(() => {
        return countedItems.reduce((sum, item) => {
            const counted = item.countedQuantity || 0;
            const system = item.systemQuantityAtCountTime || 0;
            return sum + (counted - system);
        }, 0);
    }, [countedItems]);

    // In the handleSave function, update the payload creation:
    const handleSave = async (isFinalize: boolean = false) => {
        if (isProcessing) return;

        // Your existing validation code...

        const itemsWithVariance = countedItems.map(item => {
            return {
                _key: item._key,
                stockItem: item.stockItem._id,
                countedQuantity: item.countedQuantity || 0,
                systemQuantityAtCountTime: item.systemQuantityAtCountTime || 0,
                variance: (item.countedQuantity || 0) - (item.systemQuantityAtCountTime || 0),
            };
        });

        // Determine status
        let status;
        if (isFinalize) {
            status = 'completed';
        } else {
            status = binCount?.status || 'draft';
        }

        // Build payload - for new counts, let the API generate the countNumber
        const payload = {
            countDate: new Date(countDate).toISOString(),
            bin: selectedBin?._id || "",
            countedBy: session?.user?.id,
            notes,
            countedItems: itemsWithVariance,
            status: status,
            // Don't include countNumber for new counts - let API generate it
            ...(binCount && {
                _id: binCount._id,
                countNumber: binCount.countNumber // Only include for updates
            }),
        };

        console.log('Saving with payload:', payload);

        try {
            const method = binCount ? 'PUT' : 'POST';
            const url = '/api/bin-counts';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(binCount ? payload : { ...payload }), // For new counts, don't include countNumber
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save bin count');
            }

            const result = await response.json();
            console.log('Save result:', result);

            toast({
                title: `Count ${isFinalize ? 'Finalized' : 'Saved'}`,
                description: `The bin count ${result.countNumber} has been successfully ${isFinalize ? 'finalized' : 'saved'}.`,
                status: 'success',
                duration: 5000,
                isClosable: true,
            });

            onClose();
            onSave();
        } catch (error: any) {
            console.error('Error saving bin count:', error);
            toast({
                title: 'Error',
                description: error.message || 'An unexpected error occurred.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
            setIsProcessing(false);
        }
    };

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', md: '3xl' }} scrollBehavior="inside">
                <ModalOverlay />
                <ModalContent bg={modalBg}>
                    <ModalHeader
                        bg={useColorModeValue('neutral.light.bg-header', 'neutral.dark.bg-header')}
                        borderBottom="1px solid"
                        borderColor={borderColor}
                        pb={4}
                    >
                        <Heading size="md" fontWeight="bold">
                            {binCount ? `Bin Count ${binCount.countNumber}` : 'New Bin Count'}
                        </Heading>
                    </ModalHeader>
                    <ModalCloseButton />
                    <ModalBody
                        overflowY="auto"
                        maxH={{ base: 'calc(100vh - 200px)', md: 'calc(100vh - 300px)' }}
                        pb={6}
                    >
                        <VStack spacing={4} pt={4}>
                            <FormControl id="bin-name" isRequired>
                                <FormLabel>Bin</FormLabel>
                                <HStack spacing={2} flexWrap="wrap">
                                    <Input
                                        placeholder="Select a Bin"
                                        value={selectedBin?.name || ''}
                                        readOnly
                                        flex="1"
                                    />
                                    <Button
                                        onClick={() => setIsBinModalOpen(true)}
                                        isDisabled={isViewMode || !!binCount}
                                        minW="120px"
                                        colorScheme="brand"
                                        variant="outline"
                                    >
                                        Select Bin
                                    </Button>
                                </HStack>
                            </FormControl>
                            <FormControl id="count-date" isRequired>
                                <FormLabel>Count Date</FormLabel>
                                <Input
                                    type="date"
                                    value={countDate}
                                    onChange={(e) => setCountDate(e.target.value)}
                                    isReadOnly={isViewMode}
                                />
                            </FormControl>
                            <FormControl id="notes">
                                <FormLabel>Notes</FormLabel>
                                <Input
                                    placeholder="Add any notes about the count"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    isReadOnly={isViewMode}
                                />
                            </FormControl>

                            <Box w="100%" mt={8}>
                                <Heading size="md" mb={4}>Counted Items</Heading>
                                <Card bg={cardBg} shadow="md" borderWidth="1px" borderColor={borderColor}>
                                    <CardBody p={{ base: 2, md: 4 }}>
                                        {/* Desktop View: Table */}
                                        <TableContainer
                                            display={{ base: 'none', md: 'block' }}
                                            maxH="400px"
                                            overflowY="auto"
                                            border="1px solid"
                                            borderColor={borderColor}
                                            borderRadius="md"
                                        >
                                            <Table variant="simple" size="sm">
                                                <Thead bg={tableHeaderBg} position="sticky" top={0} zIndex={1}>
                                                    <Tr>
                                                        <Th color={tableHeaderText}>Item</Th>
                                                        <Th color={tableHeaderText}>System Qty</Th>
                                                        <Th isNumeric color={tableHeaderText}>Counted Qty</Th>
                                                        <Th isNumeric color={tableHeaderText}>Variance</Th>
                                                        {!isViewMode && <Th color={tableHeaderText}>Actions</Th>}
                                                    </Tr>
                                                </Thead>
                                                <Tbody>
                                                    {countedItems.map((item) => (
                                                        <Tr key={item._key}>
                                                            <Td>
                                                                <VStack align="start" spacing={0}>
                                                                    <Text fontWeight="bold">{item.stockItem.name}</Text>
                                                                    <Text fontSize="xs" color="neutral.light.text-secondary">{item.stockItem.sku}</Text>
                                                                </VStack>
                                                            </Td>
                                                            <Td>{item.systemQuantityAtCountTime}</Td>
                                                            <Td>
                                                                {isViewMode ? (
                                                                    <Text>{item.countedQuantity}</Text>
                                                                ) : (
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        value={item.countedQuantity === 0 ? '' : item.countedQuantity}
                                                                        onChange={(e) => handleCountedQuantityChange(item._key!, e.target.value)}
                                                                        placeholder="0"
                                                                        size="sm"
                                                                    />
                                                                )}
                                                            </Td>
                                                            <Td isNumeric>
                                                                <Badge
                                                                    colorScheme={(item.countedQuantity - (item.systemQuantityAtCountTime || 0)) === 0 ? 'green' : 'red'}
                                                                >
                                                                    {(item.countedQuantity - (item.systemQuantityAtCountTime || 0)).toFixed(2)}
                                                                </Badge>
                                                            </Td>
                                                            {!isViewMode && (
                                                                <Td>
                                                                    <IconButton
                                                                        aria-label="Remove item"
                                                                        icon={<FiTrash2 />}
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        colorScheme="red"
                                                                        onClick={() => handleRemoveItem(item._key!)}
                                                                    />
                                                                </Td>
                                                            )}
                                                        </Tr>
                                                    ))}
                                                </Tbody>
                                            </Table>
                                        </TableContainer>

                                        {/* Mobile View: Card List */}
                                        <VStack
                                            display={{ base: 'flex', md: 'none' }}
                                            spacing={4}
                                            align="stretch"
                                            maxH="400px"
                                            overflowY="auto"
                                            pr={2}
                                        >
                                            {countedItems.length > 0 ? (
                                                countedItems.map((item) => (
                                                    <Card key={item._key} bg={cardBg} variant="outline" borderColor={borderColor}>
                                                        <CardBody p={4}>
                                                            <VStack align="stretch" spacing={2}>
                                                                <HStack justifyContent="space-between">
                                                                    <VStack align="start" spacing={0}>
                                                                        <Text fontWeight="bold">{item.stockItem.name}</Text>
                                                                        <Text fontSize="sm" color="gray.500">{item.stockItem.sku}</Text>
                                                                    </VStack>
                                                                    {!isViewMode && (
                                                                        <IconButton
                                                                            aria-label="Remove item"
                                                                            icon={<FiTrash2 />}
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            colorScheme="red"
                                                                            onClick={() => handleRemoveItem(item._key!)}
                                                                        />
                                                                    )}
                                                                </HStack>
                                                                <Divider />
                                                                <HStack justifyContent="space-between" pt={2}>
                                                                    <Text fontSize="sm" fontWeight="medium">System Qty:</Text>
                                                                    <Text fontSize="sm">{item.systemQuantityAtCountTime}</Text>
                                                                </HStack>
                                                                <HStack justifyContent="space-between">
                                                                    <Text fontSize="sm" fontWeight="medium">Counted Qty:</Text>
                                                                    <Box w="100px">
                                                                        <Input
                                                                            value={item.countedQuantity === 0 ? '' : item.countedQuantity}
                                                                            onChange={(e) => handleCountedQuantityChange(item._key!, e.target.value)}
                                                                            type="number"
                                                                            step="0.1"
                                                                            min="0"
                                                                            isDisabled={isViewMode}
                                                                            placeholder="0"
                                                                            width="100px"
                                                                            size="sm"
                                                                        />
                                                                    </Box>
                                                                </HStack>
                                                                <HStack justifyContent="space-between">
                                                                    <Text fontSize="sm" fontWeight="medium">Variance:</Text>
                                                                    <Badge
                                                                        colorScheme={(item.countedQuantity - (item.systemQuantityAtCountTime || 0)) === 0 ? 'green' : 'red'}
                                                                    >
                                                                        {item.countedQuantity - (item.systemQuantityAtCountTime || 0)}
                                                                    </Badge>
                                                                </HStack>
                                                            </VStack>
                                                        </CardBody>
                                                    </Card>
                                                ))
                                            ) : (
                                                <Text textAlign="center" color="neutral.light.text-secondary" py={4}>No items added yet.</Text>
                                            )}
                                        </VStack>
                                    </CardBody>
                                </Card>
                            </Box>

                            {!isViewMode && (
                                <HStack w="100%" justifyContent="space-between" mt={4} flexDirection={{ base: 'column', md: 'row' }} spacing={{ base: 4, md: 0 }}>
                                    <Button
                                        leftIcon={<FiPlus />}
                                        onClick={() => {
                                            if (!selectedBin) {
                                                toast({
                                                    title: "Bin Required",
                                                    description: "Please select a bin before adding items.",
                                                    status: "warning",
                                                    duration: 3000,
                                                    isClosable: true,
                                                });
                                                return;
                                            }
                                            setIsStockItemModalOpen(true);
                                        }}
                                        isDisabled={isViewMode}
                                        colorScheme="brand"
                                    >
                                        Add Item
                                    </Button>

                                    <Text fontWeight="bold">
                                        Total Variance: <Badge colorScheme={totalVariance !== 0 ? 'red' : 'green'}>{totalVariance}</Badge>
                                    </Text>
                                </HStack>
                            )}
                        </VStack>
                    </ModalBody>

                    <ModalFooter
                        borderTopWidth="1px"
                        borderColor={borderColor}
                        pt={4}
                    >
                        <Button colorScheme="gray" mr={3} onClick={onClose} isDisabled={loading || isProcessing}>
                            Cancel
                        </Button>
                        {!isViewMode && (
                            <HStack spacing={3} flexWrap="wrap">
                                {binCount && binCount.countedItems.some((item: any) => !item.stockItem) && (
                                    <Button
                                        colorScheme="orange"
                                        onClick={() => fixBrokenBinCount(binCount._id)}
                                        isLoading={isProcessing}
                                        leftIcon={<FiCheck />}
                                    >
                                        Fix Broken Count
                                    </Button>
                                )}
                                <Button
                                    colorScheme="brand"
                                    variant="outline"
                                    onClick={() => handleSave(false)}
                                    isLoading={loading || isProcessing}
                                    leftIcon={<FiSave />}
                                >
                                    Save Draft
                                </Button>
                                <Button
                                    colorScheme="green"
                                    onClick={() => handleSave(true)}
                                    isLoading={loading || isProcessing}
                                    isDisabled={countedItems.length === 0}
                                    leftIcon={<FiCheck />}
                                >
                                    Finalize Count
                                </Button>
                            </HStack>
                        )}
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <BinSelectorModal
                isOpen={isBinModalOpen}
                onClose={() => setIsBinModalOpen(false)}
                onSelect={handleBinSelect}
            />

            <StockItemSelectorModal
                isOpen={isStockItemModalOpen}
                onClose={() => setIsStockItemModalOpen(false)}
                onSelect={handleStockItemsSelect}
                existingItemIds={countedItemIds}
            />
        </>
    );
}