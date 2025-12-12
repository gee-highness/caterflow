// Enhanced StockItemSelectorModal.tsx with better scrolling UX
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    Input,
    Select,
    Box,
    Text,
    Badge,
    useToast,
    InputGroup,
    InputLeftElement,
    InputRightElement,
    Spinner,
    useColorModeValue,
    Checkbox,
    Flex,
    Icon,
    Tooltip,
    SimpleGrid,
    Progress,
} from '@chakra-ui/react';
import { FiSearch, FiCheck, FiX, FiFilter, FiPackage, FiShoppingCart } from 'react-icons/fi';

interface StockItem {
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
    currentStock: number;
    unitPrice?: number;
    minStockLevel?: number;
    maxStockLevel?: number;
}

interface Category {
    _id: string;
    title: string;
}

interface StockItemSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (items: StockItem[]) => void;
    existingItemIds: (string | undefined)[];
    sourceBinId?: string;
    multiSelect?: boolean;
    showStockLevels?: boolean;
    showPrices?: boolean;
}

export default function StockItemSelectorModal({
    isOpen,
    onClose,
    onSelect,
    existingItemIds,
    sourceBinId,
    multiSelect = true,
    showStockLevels = true,
    showPrices = true
}: StockItemSelectorModalProps) {
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<StockItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedItems, setSelectedItems] = useState<StockItem[]>([]);
    const toast = useToast();
    const itemsContainerRef = useRef<HTMLDivElement>(null);

    // Theme-aware colors
    const searchIconColor = useColorModeValue('neutral.light.icon-color', 'neutral.dark.icon-color');
    const noItemsTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const listItemHoverBg = useColorModeValue('neutral.light.bg-secondary', 'neutral.dark.bg-card-hover');
    const listItemBorderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const footerBorderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const selectedItemBg = useColorModeValue('blue.50', 'blue.900');
    const scrollbarThumbColor = useColorModeValue('gray.300', 'gray.600');
    const scrollbarTrackColor = useColorModeValue('gray.100', 'gray.800');

    const fetchStockItems = useCallback(async () => {
        setLoading(true);
        try {
            const url = sourceBinId ? `/api/stock-items?binId=${sourceBinId}` : '/api/stock-items';
            const [itemsRes, categoriesRes] = await Promise.all([
                fetch(url),
                fetch('/api/categories'),
            ]);

            if (!itemsRes.ok || !categoriesRes.ok) {
                throw new Error('Failed to fetch data');
            }

            const itemsData = await itemsRes.json();
            const categoriesData = await categoriesRes.json();

            setStockItems(itemsData);
            setCategories(categoriesData);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching stock items:', error);
            toast({
                title: 'Error fetching stock items.',
                description: 'Failed to load stock items and categories.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            setLoading(false);
        }
    }, [sourceBinId, toast]);

    useEffect(() => {
        if (isOpen) {
            fetchStockItems();
            setSelectedItems([]);
        }
    }, [isOpen, fetchStockItems]);

    // Memoize filtered items for better performance
    const memoizedFilteredItems = useMemo(() => {
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        let items = stockItems.filter(item =>
            !existingItemIds.includes(item._id) &&
            (selectedCategory === '' || item.category?._id === selectedCategory) &&
            (item.name.toLowerCase().includes(lowercasedSearchTerm) ||
                item.sku.toLowerCase().includes(lowercasedSearchTerm) ||
                (item.description && item.description.toLowerCase().includes(lowercasedSearchTerm)))
        );

        // Sort by name by default
        items.sort((a, b) => a.name.localeCompare(b.name));

        return items;
    }, [searchTerm, selectedCategory, stockItems, existingItemIds]);

    useEffect(() => {
        setFilteredItems(memoizedFilteredItems);
    }, [memoizedFilteredItems]);

    const handleItemSelect = (item: StockItem) => {
        if (multiSelect) {
            setSelectedItems(prev => {
                const isAlreadySelected = prev.some(selected => selected._id === item._id);
                if (isAlreadySelected) {
                    return prev.filter(selected => selected._id !== item._id);
                } else {
                    return [...prev, item];
                }
            });
        } else {
            onSelect([item]);
            onClose();
        }
    };

    const handleConfirmSelection = () => {
        if (selectedItems.length === 0) {
            toast({
                title: 'No items selected',
                description: 'Please select at least one item.',
                status: 'warning',
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        onSelect(selectedItems);
        onClose();
    };

    const isItemSelected = (itemId: string) => {
        return selectedItems.some(item => item._id === itemId);
    };

    const getItemTypeColor = (itemType: 'food' | 'nonFood') => {
        return itemType === 'food' ? 'orange' : 'teal';
    };

    const getStockLevelColor = (item: StockItem) => {
        if (!item.minStockLevel || !item.maxStockLevel) return 'gray';
        const percentage = (item.currentStock / item.maxStockLevel) * 100;
        if (percentage <= 20) return 'red';
        if (percentage <= 50) return 'orange';
        return 'green';
    };

    const getStockLevelText = (item: StockItem) => {
        if (!item.minStockLevel || !item.maxStockLevel) return 'N/A';
        if (item.currentStock <= item.minStockLevel) return 'Low Stock';
        if (item.currentStock >= item.maxStockLevel) return 'Overstocked';
        return 'In Stock';
    };

    const clearFilters = () => {
        setSearchTerm('');
        setSelectedCategory('');
    };

    const clearSelection = () => {
        setSelectedItems([]);
    };

    const selectAll = () => {
        if (filteredItems.length > 0) {
            setSelectedItems(filteredItems);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="4xl"
            closeOnOverlayClick={false}
            scrollBehavior="outside"
            motionPreset="slideInBottom"
        >
            <ModalOverlay backdropFilter="blur(4px)" />
            <ModalContent
                maxH="85vh"
                display="flex"
                flexDirection="column"
            >
                <ModalHeader borderBottomWidth="1px" flexShrink={0}>
                    <VStack align="start" spacing={3}>
                        <Flex justify="space-between" align="center" w="full">
                            <HStack spacing={2}>
                                <Icon as={FiShoppingCart} boxSize={5} />
                                <Text fontSize="xl" fontWeight="bold">Select Stock Items</Text>
                            </HStack>
                            {multiSelect && selectedItems.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    colorScheme="red"
                                    onClick={clearSelection}
                                    leftIcon={<FiX />}
                                >
                                    Clear ({selectedItems.length})
                                </Button>
                            )}
                        </Flex>
                        {multiSelect && (
                            <Flex align="center" gap={4}>
                                <Badge colorScheme="blue" variant="solid">
                                    {selectedItems.length} item(s) selected
                                </Badge>
                                <Text fontSize="sm" color="gray.600">
                                    {filteredItems.length} available items
                                </Text>
                            </Flex>
                        )}
                    </VStack>
                </ModalHeader>
                <ModalCloseButton />

                <ModalBody
                    py={4}
                    flex="1"
                    overflow="hidden"
                    display="flex"
                    flexDirection="column"
                    minHeight="0"
                    onWheel={(e) => {
                        // Pass wheel events to the scrollable container
                        if (itemsContainerRef.current) {
                            itemsContainerRef.current.scrollTop += e.deltaY;
                            e.preventDefault();
                        }
                    }}
                >
                    <VStack spacing={4} align="stretch" flex="1" overflow="hidden" minHeight="0">
                        {/* Search and Filters */}
                        <VStack spacing={3} align="stretch" flexShrink={0}>
                            <InputGroup size="lg">
                                <InputLeftElement pointerEvents="none">
                                    <FiSearch color={searchIconColor} />
                                </InputLeftElement>
                                <Input
                                    placeholder="Search by name, SKU, or description..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                                {searchTerm && (
                                    <InputRightElement>
                                        <Icon
                                            as={FiX}
                                            cursor="pointer"
                                            onClick={() => setSearchTerm('')}
                                            color="gray.500"
                                            _hover={{ color: 'gray.700' }}
                                        />
                                    </InputRightElement>
                                )}
                            </InputGroup>

                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                                <Select
                                    placeholder="All Categories"
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    size="md"
                                >
                                    {categories.map(category => (
                                        <option key={category._id} value={category._id}>
                                            {category.title}
                                        </option>
                                    ))}
                                </Select>

                                <HStack spacing={2}>
                                    <Button
                                        size="md"
                                        variant="outline"
                                        onClick={clearFilters}
                                        isDisabled={!searchTerm && !selectedCategory}
                                        leftIcon={<FiFilter />}
                                        flex="1"
                                    >
                                        Clear Filters
                                    </Button>
                                    {multiSelect && filteredItems.length > 0 && (
                                        <Button
                                            size="md"
                                            variant="outline"
                                            onClick={selectAll}
                                            colorScheme="blue"
                                        >
                                            Select All
                                        </Button>
                                    )}
                                </HStack>
                            </SimpleGrid>
                        </VStack>

                        {/* Items List Container */}
                        <Box
                            ref={itemsContainerRef}
                            flex="1"
                            overflowY="auto"
                            borderRadius="md"
                            borderWidth="1px"
                            borderColor={listItemBorderColor}
                            p={2}
                            minHeight="0"
                            onWheel={(e) => {
                                // Allow wheel scrolling even when pointer is over nested elements
                                e.stopPropagation();
                            }}
                            sx={{
                                '&::-webkit-scrollbar': {
                                    width: '10px',
                                },
                                '&::-webkit-scrollbar-track': {
                                    background: scrollbarTrackColor,
                                    borderRadius: '5px',
                                },
                                '&::-webkit-scrollbar-thumb': {
                                    background: scrollbarThumbColor,
                                    borderRadius: '5px',
                                    '&:hover': {
                                        background: useColorModeValue('gray.400', 'gray.500'),
                                    }
                                },
                                // Fix for wheel scrolling
                                pointerEvents: 'auto',
                            }}
                        >
                            {loading ? (
                                <Flex direction="column" align="center" justify="center" py={10} h="full">
                                    <Spinner size="xl" color="blue.500" thickness="3px" />
                                    <Text mt={4} color="gray.600">Loading stock items...</Text>
                                </Flex>
                            ) : filteredItems.length === 0 ? (
                                <Flex direction="column" align="center" justify="center" py={10} h="full">
                                    <Icon as={FiPackage} boxSize={12} color="gray.400" mb={4} />
                                    <Text fontSize="lg" color={noItemsTextColor} fontWeight="medium">
                                        {searchTerm || selectedCategory ? 'No items match your search.' : 'No stock items available.'}
                                    </Text>
                                    {(searchTerm || selectedCategory) && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={clearFilters}
                                            mt={3}
                                        >
                                            Clear filters to see all items
                                        </Button>
                                    )}
                                </Flex>
                            ) : (
                                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}
                                    overflow="visible"
                                    minHeight="0"
                                >
                                    {filteredItems.map((item) => {
                                        const isSelected = isItemSelected(item._id);
                                        const stockLevelColor = getStockLevelColor(item);
                                        const stockLevelText = getStockLevelText(item);

                                        return (
                                            <Box
                                                key={item._id}
                                                maxHeight="180px"
                                                p={3}
                                                borderWidth="2px"
                                                borderColor={isSelected ? 'blue.500' : listItemBorderColor}
                                                borderRadius="lg"
                                                bg={isSelected ? selectedItemBg : 'transparent'}
                                                _hover={{
                                                    bg: isSelected ? selectedItemBg : listItemHoverBg,
                                                    borderColor: isSelected ? 'blue.500' : 'blue.300',
                                                    cursor: 'pointer',
                                                    transform: 'translateY(-2px)',
                                                    transition: 'all 0.2s'
                                                }}
                                                onClick={() => handleItemSelect(item)}
                                                onTouchStart={(e) => e.stopPropagation()} // Prevent touch event bubbling
                                                position="relative"
                                                transition="all 0.2s"
                                                sx={{
                                                    // Ensure touch events work properly
                                                    touchAction: 'manipulation',
                                                    userSelect: 'none',
                                                    WebkitTapHighlightColor: 'transparent',
                                                    // Fix wheel scrolling
                                                    pointerEvents: 'auto',
                                                    '& *': {
                                                        pointerEvents: 'auto',
                                                    },
                                                    '&:hover': {
                                                        overflowY: 'auto',
                                                    },
                                                }}
                                            >
                                                <HStack align="start" spacing={3}>
                                                    {multiSelect && (
                                                        <Checkbox
                                                            isChecked={isSelected}
                                                            onChange={() => handleItemSelect(item)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            size="lg"
                                                            colorScheme="blue"
                                                            mt={1}
                                                            sx={{
                                                                // Ensure checkbox is tappable
                                                                pointerEvents: 'auto',
                                                            }}
                                                        />
                                                    )}
                                                    <VStack align="start" spacing={2} flex="1">
                                                        <HStack justify="space-between" w="full">
                                                            <Text fontWeight="bold" fontSize="md" noOfLines={1}>
                                                                {item.name}
                                                            </Text>
                                                            <HStack spacing={2}>
                                                                <Badge
                                                                    colorScheme={getItemTypeColor(item.itemType)}
                                                                    variant="subtle"
                                                                >
                                                                    {item.itemType}
                                                                </Badge>
                                                                {showStockLevels && item.minStockLevel && item.maxStockLevel && (
                                                                    <Badge
                                                                        colorScheme={stockLevelColor}
                                                                        variant="solid"
                                                                        size="sm"
                                                                    >
                                                                        {stockLevelText}
                                                                    </Badge>
                                                                )}
                                                            </HStack>
                                                        </HStack>

                                                        <HStack spacing={4} w="full">
                                                            <VStack align="start" spacing={0}>
                                                                <Text fontSize="sm" color="gray.600" fontWeight="medium">
                                                                    SKU: {item.sku}
                                                                </Text>
                                                                <Text fontSize="sm" color="gray.600">
                                                                    Unit: {item.unitOfMeasure}
                                                                </Text>
                                                            </VStack>

                                                            {showPrices && item.unitPrice && (
                                                                <Badge
                                                                    colorScheme="green"
                                                                    variant="solid"
                                                                    fontSize="sm"
                                                                >
                                                                    E {item.unitPrice.toFixed(2)}
                                                                </Badge>
                                                            )}
                                                        </HStack>

                                                        {item.description && (
                                                            <Text fontSize="sm" color="gray.700" noOfLines={2}>
                                                                {item.description}
                                                            </Text>
                                                        )}

                                                        {showStockLevels && sourceBinId && (
                                                            <VStack align="start" spacing={1} w="full">
                                                                <HStack justify="space-between" w="full">
                                                                    <Text fontSize="sm" fontWeight="medium">
                                                                        Current Stock:
                                                                    </Text>
                                                                    <Text fontSize="sm" fontWeight="bold" color={stockLevelColor}>
                                                                        {item.currentStock} {item.unitOfMeasure}
                                                                    </Text>
                                                                </HStack>
                                                                {item.minStockLevel && item.maxStockLevel && (
                                                                    <Tooltip
                                                                        label={`Min: ${item.minStockLevel} | Max: ${item.maxStockLevel}`}
                                                                        placement="top"
                                                                    >
                                                                        <Progress
                                                                            value={(item.currentStock / item.maxStockLevel) * 100}
                                                                            colorScheme={stockLevelColor}
                                                                            size="sm"
                                                                            borderRadius="full"
                                                                            w="full"
                                                                        />
                                                                    </Tooltip>
                                                                )}
                                                            </VStack>
                                                        )}
                                                    </VStack>
                                                    {isSelected && multiSelect && (
                                                        <Icon
                                                            as={FiCheck}
                                                            color="green.500"
                                                            boxSize={5}
                                                            position="absolute"
                                                            top={2}
                                                            right={2}
                                                        />
                                                    )}
                                                </HStack>
                                            </Box>
                                        );
                                    })}
                                </SimpleGrid>
                            )}
                        </Box>

                        {/* Selected Items Summary (when multi-select) */}
                        {multiSelect && selectedItems.length > 0 && (
                            <Box
                                p={3}
                                borderRadius="md"
                                bg="blue.50"
                                borderWidth="1px"
                                borderColor="blue.200"
                                flexShrink={0}
                            >
                                <VStack align="start" spacing={2}>
                                    <HStack>
                                        <Icon as={FiCheck} color="green.500" />
                                        <Text fontWeight="bold">Selected Items Summary</Text>
                                    </HStack>
                                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} w="full">
                                        <HStack>
                                            <Text fontSize="sm">Total Items:</Text>
                                            <Badge colorScheme="blue">{selectedItems.length}</Badge>
                                        </HStack>
                                        {showPrices && (
                                            <HStack>
                                                <Text fontSize="sm">Estimated Cost:</Text>
                                                <Badge colorScheme="green">
                                                    ${selectedItems.reduce((sum, item) => sum + (item.unitPrice || 0), 0).toFixed(2)}
                                                </Badge>
                                            </HStack>
                                        )}
                                    </SimpleGrid>
                                </VStack>
                            </Box>
                        )}
                    </VStack>
                </ModalBody>

                <ModalFooter
                    borderTop="1px solid"
                    borderColor={footerBorderColor}
                    pt={4}
                    flexShrink={0}
                >
                    <HStack spacing={3} w="full" justify="space-between">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        {multiSelect ? (
                            <HStack spacing={3}>
                                <Text fontSize="sm" color="gray.600">
                                    {selectedItems.length} item(s) selected
                                </Text>
                                <Button
                                    colorScheme="blue"
                                    onClick={handleConfirmSelection}
                                    isDisabled={selectedItems.length === 0}
                                    leftIcon={<FiCheck />}
                                    size="lg"
                                    px={6}
                                >
                                    Add {selectedItems.length} Item{selectedItems.length !== 1 ? 's' : ''}
                                </Button>
                            </HStack>
                        ) : (
                            <Text fontSize="sm" color="gray.600" fontStyle="italic">
                                Click on an item to select it
                            </Text>
                        )}
                    </HStack>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}