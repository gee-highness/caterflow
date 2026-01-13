'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
    Select,
    useToast,
    VStack,
    HStack,
    Text,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    Badge,
    Spinner,
    Flex,
    Box,
    useColorModeValue,
    Icon,
    SimpleGrid,
    Image
} from '@chakra-ui/react';
import { FiCheck, FiSave, FiX, FiCheckCircle, FiFileText, FiDollarSign } from 'react-icons/fi';
import FileUploadModal from '@/components/FileUploadModal';
import BinSelectorModal from '@/components/BinSelectorModal';
import { parseInvoiceMetadata, isInvoiceAttachment, getInvoiceDisplayInfo } from '@/lib/invoiceUtils';
import { FiChevronUp, FiChevronDown, FiTrash2 } from 'react-icons/fi';
import { urlFor } from '@/lib/sanity';

// Interfaces for the data
interface ReceivedItemData {
    _key: string;
    stockItem: {
        _id: string;
        name: string;
        sku?: string;
        unitOfMeasure?: string;
        unitPrice?: number;
    };
    orderedQuantity?: number;
    receivedQuantity: number;
    totalPrice?: number;
    unitPrice?: number;
    batchNumber?: string;
    expiryDate?: string;
    condition: string;
}

// Update GoodsReceiptData interface to include orderedItems with suppliers
interface GoodsReceiptData {
    _id: string;
    receiptNumber: string;
    receiptDate: string;
    status: string;
    notes?: string;
    purchaseOrder?: {
        _id: string;
        poNumber: string;
        status: string;
        orderDate: string;
        supplier?: {
            _id: string;
            name: string;
        };
        site?: {
            _id: string;
            name: string;
        };
        // Add orderedItems with suppliers from the API
        orderedItems?: Array<{
            _key: string;
            orderedQuantity: number;
            unitPrice: number;
            stockItem: {
                _id: string;
                name: string;
                sku?: string;
                unitOfMeasure?: string;
            };
            supplier?: {
                _id: string;
                name: string;
                contactPerson?: string;
                phoneNumber?: string;
                email?: string;
            };
        }>;
    };
    receivingBin?: {
        _id: string;
        name: string;
    };
    receivedItems: ReceivedItemData[];
    attachments?: {
        _id: string;
        fileName?: string;
        fileType?: string;
        description?: string;
        uploadedAt?: string;
        file?: {
            asset?: {
                _id: string;
                _type: string;
                url?: string;
                originalFilename?: string;
                mimeType?: string;
            };
        };
    }[];
    // Add supplierNames if returned by API
    supplierNames?: string;
}

interface GoodsReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    receipt: GoodsReceiptData | null;
    onSave: () => void;
    approvedPurchaseOrders?: any[];
    preSelectedPO?: string | null;
}

interface Bin {
    _id: string;
    name: string;
    binType: string;
    site: {
        _id: string;
        name: string;
    };
}

// Initial state for a new receipt
const initialFormData = {
    receiptNumber: '',
    receiptDate: new Date().toISOString().split('T')[0],
    status: 'draft',
    notes: '',
    purchaseOrder: undefined,
    receivingBin: undefined,
    receivedItems: [],
};

// Helper function to extract supplier names from ordered items
const extractSupplierNames = (orderedItems: any[]): string => {
    if (!orderedItems || orderedItems.length === 0) return 'No suppliers';

    const supplierNames = orderedItems
        .map((item: any) => item.supplier?.name)
        .filter((name: string | undefined) => name && name.trim() !== '');

    const uniqueSupplierNames = [...new Set(supplierNames)];

    if (uniqueSupplierNames.length === 0) return 'No suppliers';
    if (uniqueSupplierNames.length <= 2) return uniqueSupplierNames.join(', ');

    return `${uniqueSupplierNames.slice(0, 2).join(', ')} +${uniqueSupplierNames.length - 2} more`;
};

export default function GoodsReceiptModal({
    isOpen,
    onClose,
    receipt,
    onSave,
    approvedPurchaseOrders = [],
    preSelectedPO = null,
}: GoodsReceiptModalProps) {
    const toast = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isBinSelectorOpen, setIsBinSelectorOpen] = useState(false);

    const [formData, setFormData] = useState<Partial<GoodsReceiptData>>(initialFormData);
    const [availableBins, setAvailableBins] = useState<Bin[]>([]);
    const [savedReceiptId, setSavedReceiptId] = useState<string>('');

    const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

    const isNewReceipt = !receipt || receipt._id.startsWith('temp-');

    const modalBg = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const inputBg = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const tableHeaderBg = useColorModeValue('neutral.light.bg-card-hover', 'neutral.dark.bg-card-hover');
    const tableHoverBg = useColorModeValue('neutral.light.bg-card-hover', 'neutral.dark.bg-card-hover');

    const fetchBinsForSite = useCallback(async (siteId: string) => {
        if (!siteId) {
            setAvailableBins([]);
            return;
        }
        try {
            const binsResponse = await fetch(`/api/bins?siteId=${siteId}`);
            if (binsResponse.ok) {
                const bins: Bin[] = await binsResponse.json();
                setAvailableBins(bins);
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'Failed to load receiving bins for the site.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    }, [toast]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!isOpen) {
                setFormData(initialFormData);
                setAvailableBins([]);
                setSavedReceiptId('');
                return;
            }

            setIsLoading(true);

            // Editing an existing receipt
            if (receipt && !isNewReceipt) {
                try {
                    const response = await fetch(`/api/goods-receipts/${receipt._id}`);
                    if (!response.ok) throw new Error('Failed to fetch receipt details');
                    const fullReceiptData: GoodsReceiptData = await response.json();

                    // Fetch current stock item prices for accurate calculations
                    const itemsWithCurrentPrices = await fetchCurrentStockItemPrices(fullReceiptData.receivedItems || []);
                    fullReceiptData.receivedItems = itemsWithCurrentPrices;

                    setFormData(fullReceiptData);
                    setSavedReceiptId(fullReceiptData._id);
                    if (fullReceiptData.purchaseOrder?.site?._id) {
                        await fetchBinsForSite(fullReceiptData.purchaseOrder.site._id);
                    }
                } catch (error) {
                    toast({
                        title: 'Error',
                        description: `Could not load receipt details. ${error instanceof Error ? error.message : ''}`,
                        status: 'error',
                        duration: 5000,
                        isClosable: true,
                    });
                    onClose();
                }
            }
            // Creating a new receipt with a pre-selected PO
            else if (preSelectedPO) {
                try {
                    const poResponse = await fetch(`/api/purchase-orders?id=${preSelectedPO}`);
                    if (!poResponse.ok) throw new Error('Failed to fetch PO details');
                    const poData = await poResponse.json();

                    // Extract supplier names from the PO's ordered items
                    const supplierNames = poData.orderedItems
                        ? extractSupplierNames(poData.orderedItems)
                        : 'No suppliers';

                    const initialItems: ReceivedItemData[] = (poData.orderedItems || []).map((item: any) => {
                        const unitPrice = item.unitPrice || item.stockItem?.unitPrice || 0;
                        const receivedQuantity = 0;

                        return {
                            _key: item._key || Math.random().toString(36).substr(2, 9),
                            stockItem: {
                                _id: item.stockItem?._id || '',
                                name: item.stockItem?.name || 'Unknown Item',
                                sku: item.stockItem?.sku,
                                unitOfMeasure: item.stockItem?.unitOfMeasure,
                                unitPrice: unitPrice
                            },
                            orderedQuantity: item.orderedQuantity || 0,
                            receivedQuantity: receivedQuantity,
                            totalPrice: receivedQuantity * unitPrice,
                            unitPrice: unitPrice,
                            condition: 'good',
                            batchNumber: '',
                            expiryDate: ''
                        };
                    });

                    setFormData({
                        ...initialFormData,
                        purchaseOrder: {
                            ...poData,
                            supplierNames // Add supplier names to purchase order
                        },
                        receivedItems: initialItems,
                        supplierNames // Also add supplier names to receipt
                    });

                    if (poData.site?._id) {
                        await fetchBinsForSite(poData.site._id);
                    }
                } catch (error) {
                    toast({
                        title: 'Error',
                        description: `Could not load PO details. ${error instanceof Error ? error.message : ''}`,
                        status: 'error',
                        duration: 5000,
                        isClosable: true,
                    });
                }
            }
            // Creating a new receipt without a pre-selected PO
            else {
                setFormData(initialFormData);
            }

            setIsLoading(false);
        };

        loadInitialData();
    }, [isOpen, receipt, preSelectedPO, toast, onClose, fetchBinsForSite, isNewReceipt]);

    const handleFieldChange = (field: keyof GoodsReceiptData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleItemChange = (key: string, field: keyof ReceivedItemData, value: any) => {
        const processedValue = field === 'receivedQuantity' ? handleNumberInput(value) : value;

        setFormData(prev => ({
            ...prev,
            receivedItems: (prev.receivedItems || []).map(item => {
                if (item._key === key) {
                    const updatedItem = { ...item, [field]: processedValue };

                    if (field === 'receivedQuantity') {
                        const currentUnitPrice = item.unitPrice || item.stockItem.unitPrice || 0;
                        updatedItem.totalPrice = processedValue * currentUnitPrice;
                        updatedItem.unitPrice = currentUnitPrice;
                    }

                    return updatedItem;
                }
                return item;
            }),
        }));
    };

    const handleBinSelect = (bin: Bin) => {
        handleFieldChange('receivingBin', { _id: bin._id, name: bin.name });
    };

    const saveReceipt = async (status: string = 'draft'): Promise<any> => {

        console.log(`💾 saveReceipt called with status: ${status}`);
        console.log('📦 Payload status will be:', status);

        setIsSaving(true);
        if (!formData.purchaseOrder?._id || !formData.receivingBin?._id) {
            toast({
                title: 'Missing Information',
                description: 'Please select a purchase order and a receiving bin.',
                status: 'warning',
                duration: 5000,
                isClosable: true,
            });
            setIsSaving(false);
            throw new Error('Missing purchase order or bin');
        }

        try {
            for (const item of formData.receivedItems || []) {
                if (item.unitPrice && item.unitPrice > 0) {
                    try {
                        await fetch(`/api/stock-items/${item.stockItem._id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                updates: { unitPrice: item.unitPrice }
                            }),
                        });
                        console.log(`Updated unit price for ${item.stockItem.name} to E ${item.unitPrice}`);
                    } catch (error) {
                        console.warn(`Failed to update price for ${item.stockItem.name}:`, error);
                    }
                }
            }

            const itemsToSave = (formData.receivedItems || []).map(item => ({
                _key: item._key,
                stockItem: { _type: 'reference', _ref: item.stockItem._id },
                orderedQuantity: item.orderedQuantity || 0,
                receivedQuantity: item.receivedQuantity,
                totalPrice: item.totalPrice || 0,
                unitPrice: item.unitPrice || 0,
                condition: item.condition,
                batchNumber: item.batchNumber || '',
                expiryDate: item.expiryDate || '',
            }));

            const payload = {
                receiptDate: formData.receiptDate || new Date().toISOString().split('T')[0],
                status,
                notes: formData.notes,
                purchaseOrder: { _type: 'reference', _ref: formData.purchaseOrder._id },
                receivingBin: { _type: 'reference', _ref: formData.receivingBin._id },
                receivedItems: itemsToSave,
            };

            let response;
            if (isNewReceipt) {
                response = await fetch('/api/goods-receipts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                response = await fetch(`/api/goods-receipts/${formData._id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}: Failed to save goods receipt`);
            }

            const result = await response.json();

            if (status === 'draft') {
                toast({
                    title: 'Draft Saved',
                    description: 'Goods receipt has been saved as draft.',
                    status: 'success',
                    duration: 3000,
                    isClosable: true,
                });
            }

            return result;

        } catch (error) {
            console.error('Save error:', error);
            toast({
                title: 'Error',
                description: `Failed to save goods receipt. ${error instanceof Error ? error.message : ''}`,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveDraft = () => {
        saveReceipt('draft').then(() => {
            onSave();
            onClose();
        }).catch(() => {
            // Error handling is already done in saveReceipt
        });
    };

    const isFullyReceived = true;

    const handleCompleteReceipt = async () => {
        if (!isFullyReceived) {
            toast({
                title: 'Incomplete Receipt',
                description: 'You must receive all items before completing the receipt.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        try {
            setIsSaving(true);
            let finalReceiptId = formData._id;

            if (isNewReceipt) {
                const savedReceipt = await saveReceipt('draft');
                finalReceiptId = savedReceipt._id;
                if (finalReceiptId) {
                    setSavedReceiptId(finalReceiptId);
                }
                setFormData(prev => ({ ...prev, _id: savedReceipt._id, receiptNumber: savedReceipt.receiptNumber }));
            } else if (finalReceiptId) {
                setSavedReceiptId(finalReceiptId);
            }

            if (!finalReceiptId) throw new Error('Could not determine receipt ID');

            setIsUploadModalOpen(true);
        } catch (error) {
            console.error('Failed to prepare receipt for completion:', error);
            toast({
                title: 'Error',
                description: `Failed to prepare receipt for completion. ${error instanceof Error ? error.message : ''}`,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTotalPriceChange = (key: string, value: string) => {
        const valueAsNumber = handleNumberInput(value);

        setFormData(prev => ({
            ...prev,
            receivedItems: (prev.receivedItems || []).map(item => {
                if (item._key === key) {
                    const totalPrice = valueAsNumber;
                    const unitPrice = item.receivedQuantity > 0 ? totalPrice / item.receivedQuantity : 0;
                    return {
                        ...item,
                        totalPrice,
                        unitPrice
                    };
                }
                return item;
            }),
        }));
    };

    const handleFinalizeReceipt = async (attachmentIds: string[]) => {
        setIsUploadModalOpen(false);
        try {
            setIsSaving(true);
            const receiptIdToUse = savedReceiptId || formData._id;

            if (!receiptIdToUse) throw new Error('No receipt ID available for completion');

            for (const item of formData.receivedItems || []) {
                if (item.unitPrice && item.unitPrice > 0) {
                    try {
                        await fetch(`/api/stock-items/${item.stockItem._id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                updates: { unitPrice: item.unitPrice }
                            }),
                        });
                        console.log(`Finalized: Updated unit price for ${item.stockItem.name} to E ${item.unitPrice}`);
                    } catch (error) {
                        console.warn(`Failed to update price for ${item.stockItem.name}:`, error);
                    }
                }
            }

            const completeResponse = await fetch('/api/complete-goods-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiptId: receiptIdToUse,
                    poId: formData.purchaseOrder?._id,
                    attachmentIds
                }),
            });

            if (!completeResponse.ok) {
                const errorData = await completeResponse.json();
                throw new Error(errorData.error || 'Failed to complete goods receipt transaction');
            }

            toast({
                title: 'Receipt Completed',
                description: `Goods receipt has been completed successfully with ${attachmentIds.length} evidence file(s).`,
                status: 'success',
                duration: 5000,
                isClosable: true,
            });

            onSave();
            onClose();
        } catch (error) {
            console.error('Completion error:', error);
            toast({
                title: 'Error',
                description: `Failed to complete goods receipt. ${error instanceof Error ? error.message : ''}`,
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'green';
            case 'partially-received': return 'orange';
            default: return 'gray';
        }
    };

    const safeNumber = (value: string | number): number => {
        if (typeof value === 'number') return isNaN(value) ? 0 : value;
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    };

    const handleNumberInput = (value: string): number => {
        if (value === '' || value === '-') return 0;
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
    };

    const fetchCurrentStockItemPrices = async (items: any[]) => {
        const itemsWithCurrentPrices = await Promise.all(
            items.map(async (item) => {
                try {
                    const response = await fetch(`/api/stock-items/${item.stockItem._id}`);
                    if (response.ok) {
                        const currentStockItem = await response.json();
                        return {
                            ...item,
                            stockItem: {
                                ...item.stockItem,
                                unitPrice: currentStockItem.unitPrice || 0
                            },
                            unitPrice: currentStockItem.unitPrice || item.unitPrice || 0,
                            totalPrice: item.receivedQuantity * (currentStockItem.unitPrice || item.unitPrice || 0)
                        };
                    }
                } catch (error) {
                    console.warn(`Failed to fetch current price for ${item.stockItem.name}:`, error);
                }
                return item;
            })
        );
        return itemsWithCurrentPrices;
    };

    const handleInvoiceUploadComplete = async (attachmentIds: string[]) => {
        try {
            toast({
                title: 'Invoice uploaded successfully',
                description: 'Invoice has been tracked and linked to this receipt.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });

            if (formData._id) {
                const response = await fetch(`/api/goods-receipts/${formData._id}`);
                if (response.ok) {
                    const updatedReceipt = await response.json();
                    setFormData(updatedReceipt);
                }
            }
        } catch (error) {
            console.error('Error handling invoice upload:', error);
            toast({
                title: 'Error',
                description: 'Failed to refresh receipt data after invoice upload.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    };

    const getAttachmentUrl = (attachment: any): { url: string | undefined, type: 'image' | 'file' | 'unknown' } => {
        console.log('Attachment data:', attachment);

        if (attachment.file?.asset) {
            const asset = attachment.file.asset;

            try {
                console.log('Asset found:', asset);

                if (asset._type === 'sanity.imageAsset') {
                    const url = urlFor(asset).url();
                    console.log('Generated image URL:', url);
                    return { url, type: 'image' };
                }
                else if (asset._type === 'sanity.fileAsset') {
                    const fileUrl = asset.url;
                    console.log('File asset URL:', fileUrl);
                    return { url: fileUrl, type: 'file' };
                }
                else if (asset.url) {
                    console.log('Using asset URL:', asset.url);
                    return { url: asset.url, type: asset._type === 'sanity.imageAsset' ? 'image' : 'file' };
                }
            } catch (error) {
                console.error('Error processing asset:', error);
                if (asset.url) {
                    console.log('Fallback to asset URL:', asset.url);
                    return { url: asset.url, type: 'file' };
                }
            }
        }

        if (attachment.url) {
            console.log('Using direct URL:', attachment.url);
            return { url: attachment.url, type: attachment.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? 'image' : 'file' };
        }

        console.log('No URL found for attachment');
        return { url: undefined, type: 'unknown' };
    };

    const exportGoodsReceiptPDF = () => {
        if (!formData.purchaseOrder || !formData.receivingBin) return;

        // Get supplier name from the purchase order
        const supplierName = formData.supplierNames ||
            (formData.purchaseOrder?.orderedItems && formData.purchaseOrder.orderedItems.length > 0
                ? extractSupplierNames(formData.purchaseOrder.orderedItems)
                : 'N/A');

        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Goods Receipt - ${formData.receiptNumber || 'Draft'}</title>
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
        .info-section { 
            margin-bottom: 30px;
            background: #FFFFFF;
            padding: 20px;
            border-radius: 12px;
            border: 1px solid #E2E8F0;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        .info-item {
            margin-bottom: 10px;
        }
        .info-label {
            font-weight: 600;
            color: #4A5568;
            font-size: 14px;
        }
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
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #E2E8F0;
            font-size: 12px;
            color: #718096;
            text-align: center;
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
            <h1>GOODS RECEIPT</h1>
            <p style="font-size: 16px; margin: 5px 0;">Receipt Number: <strong>${formData.receiptNumber || 'Draft'}</strong></p>
            <p style="font-size: 14px; margin: 5px 0;">Date: ${new Date(formData.receiptDate || new Date()).toLocaleDateString()}</p>
        </div>
    </div>

    <div class="info-section">
        <div class="info-grid">
            <div>
                <div class="info-item">
                    <span class="info-label">Purchase Order:</span>
                    <span> ${formData.purchaseOrder.poNumber}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Supplier:</span>
                    <span> ${supplierName}</span>
                </div>
            </div>
            <div>
                <div class="info-item">
                    <span class="info-label">Receiving Bin:</span>
                    <span> ${formData.receivingBin.name}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Site:</span>
                    <span> ${formData.purchaseOrder.site?.name || 'N/A'}</span>
                </div>
            </div>
        </div>
    </div>

    <table class="table">
        <thead>
            <tr>
                <th>Item</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Total Price</th> 
                <th>Unit Price</th> 
                <th>Unit</th>
                <th>Condition</th>
                <th>Batch Number</th>
            </tr>
        </thead>
        <tbody>
            ${(formData.receivedItems || []).map(item => {
            const displayUnitPrice = item.stockItem.unitPrice || 0;
            const displayTotalPrice = item.receivedQuantity * displayUnitPrice;

            return `
                <tr>
                    <td><strong>${item.stockItem.name}</strong></td>
                    <td>${item.orderedQuantity || 0}</td>
                    <td>${item.receivedQuantity}</td>
                    <td>E ${displayTotalPrice.toFixed(2)}</td>
                    <td>E ${displayUnitPrice.toFixed(2)}</td>
                    <td>${item.stockItem.unitOfMeasure}</td>
                    <td>${item.condition}</td>
                    <td>${item.batchNumber || 'N/A'}</td>
                </tr>
                `;
        }).join('')}
        </tbody>
    </table>

    ${formData.notes ? `
        <div class="info-section">
            <h3 style="margin: 0 0 12px 0; color: #2D3748; font-size: 16px;">Notes:</h3>
            <p style="margin: 0; color: #4A5568; line-height: 1.5;">${formData.notes}</p>
        </div>
    ` : ''}

    <div class="footer">
        <p style="margin: 0 0 8px 0;">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        <p style="margin: 0 0 8px 0;">This is a system-generated purchase order. Please provide your quotation for the requested items.</p>
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
            exportWindow.document.title = `Goods Receipt - ${formData.receiptNumber || 'Draft'}`;
        }
    };

    const modalTitle = !isNewReceipt ? `Goods Receipt: ${formData.receiptNumber}` : 'New Goods Receipt';
    const isEditable = formData.status !== 'completed';

    // Get supplier name for display
    const displaySupplierName = formData.supplierNames ||
        (formData.purchaseOrder?.orderedItems && formData.purchaseOrder.orderedItems.length > 0
            ? extractSupplierNames(formData.purchaseOrder.orderedItems)
            : 'N/A');

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} size={{ base: 'full', md: '6xl' }} scrollBehavior="inside">
                <ModalOverlay />
                <ModalContent bg={modalBg} maxW={{ base: '100%', md: '1200px' }} mx="auto" my={{ base: 0, md: 8 }} borderRadius={{ base: 'none', md: 'xl' }} boxShadow="xl" height="90vh">
                    <ModalHeader borderBottomWidth="1px" borderColor={borderColor}>{modalTitle}</ModalHeader>
                    <ModalCloseButton position="absolute" right="12px" top="12px" />
                    <ModalBody pb={6} overflowY="auto" maxH="calc(90vh - 140px)">
                        {isLoading ? (
                            <Flex justifyContent="center" alignItems="center" height="100%">
                                <Spinner size="xl" />
                            </Flex>
                        ) : (
                            <VStack spacing={4} align="stretch" color={primaryTextColor}>
                                <HStack
                                    flexDirection={{ base: 'column', sm: 'row' }}
                                    alignItems={{ base: 'flex-start', sm: 'center' }}
                                    spacing={{ base: 4, sm: 2 }}
                                >
                                    {!isNewReceipt && (
                                        <FormControl isRequired>
                                            <FormLabel color={secondaryTextColor}>Receipt Number</FormLabel>
                                            <Input value={formData.receiptNumber || ''} isReadOnly bg={inputBg} borderColor={borderColor} />
                                        </FormControl>
                                    )}
                                    <FormControl isRequired>
                                        <FormLabel color={secondaryTextColor}>Receipt Date</FormLabel>
                                        <Input
                                            type="date"
                                            value={formData.receiptDate || ''}
                                            onChange={(e) => handleFieldChange('receiptDate', e.target.value)}
                                            isReadOnly={!isEditable}
                                            bg={inputBg}
                                            borderColor={borderColor}
                                        />
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel color={secondaryTextColor}>Status</FormLabel>
                                        <Badge
                                            colorScheme={getStatusColor(formData.status || 'draft')}
                                            fontSize="md" px={3} py={1} borderRadius="full"
                                        >
                                            {(formData.status || 'draft').toUpperCase()}
                                        </Badge>
                                    </FormControl>
                                </HStack>

                                <HStack
                                    flexDirection={{ base: 'column', sm: 'row' }}
                                    alignItems={{ base: 'flex-start', sm: 'center' }}
                                    spacing={{ base: 4, sm: 2 }}
                                >
                                    <FormControl isRequired>
                                        <FormLabel color={secondaryTextColor}>Purchase Order</FormLabel>
                                        <Input value={formData.purchaseOrder?.poNumber || 'N/A'} isReadOnly bg={inputBg} borderColor={borderColor} />
                                    </FormControl>
                                    <FormControl isRequired>
                                        <FormLabel color={secondaryTextColor}>Receiving Bin</FormLabel>
                                        <HStack>
                                            <Select
                                                value={formData.receivingBin?._id || ''}
                                                onChange={(e) => handleBinSelect(availableBins.find(b => b._id === e.target.value)!)}
                                                placeholder="Select Bin"
                                                isDisabled={!isEditable || availableBins.length === 0}
                                                bg={inputBg}
                                                borderColor={borderColor}
                                            >
                                                {availableBins.map(bin => (
                                                    <option key={bin._id} value={bin._id}>
                                                        {bin.name} ({bin.binType})
                                                    </option>
                                                ))}
                                            </Select>
                                        </HStack>
                                    </FormControl>
                                </HStack>

                                {formData.purchaseOrder && (
                                    <Box p={4} borderWidth={1} borderColor={borderColor} borderRadius="md" mt={2} bg={tableHeaderBg}>
                                        <VStack align="stretch" spacing={2}>
                                            <Text fontWeight="bold" fontSize="lg">Purchase Order Details</Text>
                                            <HStack justifyContent="space-between">
                                                <Text fontWeight="medium">PO Number:</Text>
                                                <Text>{formData.purchaseOrder.poNumber}</Text>
                                            </HStack>
                                            <HStack justifyContent="space-between">
                                                <Text fontWeight="medium">Suppliers:</Text>
                                                <Text>{displaySupplierName}</Text>
                                            </HStack>
                                            <HStack justifyContent="space-between">
                                                <Text fontWeight="medium">Site:</Text>
                                                <Text>{formData.purchaseOrder.site?.name}</Text>
                                            </HStack>
                                            {formData.purchaseOrder.orderedItems && formData.purchaseOrder.orderedItems.length > 0 && (
                                                <Box mt={2}>
                                                    <Text fontWeight="medium" mb={1}>Ordered Items:</Text>
                                                    <VStack align="stretch" spacing={1}>
                                                        {formData.purchaseOrder.orderedItems.slice(0, 3).map((item, index) => (
                                                            <HStack key={item._key || index} justifyContent="space-between">
                                                                <Text fontSize="sm">{item.stockItem?.name}</Text>
                                                                <Text fontSize="sm" color={secondaryTextColor}>
                                                                    {item.orderedQuantity} × E {item.unitPrice?.toFixed(2)} = E {(item.orderedQuantity * item.unitPrice).toFixed(2)}
                                                                </Text>
                                                            </HStack>
                                                        ))}
                                                        {formData.purchaseOrder.orderedItems.length > 3 && (
                                                            <Text fontSize="sm" color={secondaryTextColor}>
                                                                +{formData.purchaseOrder.orderedItems.length - 3} more items
                                                            </Text>
                                                        )}
                                                    </VStack>
                                                </Box>
                                            )}
                                        </VStack>
                                    </Box>
                                )}

                                <FormControl>
                                    <FormLabel color={secondaryTextColor}>Notes</FormLabel>
                                    <Input
                                        value={formData.notes || ''}
                                        onChange={(e) => handleFieldChange('notes', e.target.value)}
                                        placeholder="Additional notes or comments"
                                        isDisabled={!isEditable}
                                        bg={inputBg}
                                        borderColor={borderColor}
                                    />
                                </FormControl>

                                <Box>
                                    <HStack justify="space-between" mb={4}>
                                        <Text fontSize="lg" fontWeight="bold">
                                            Received Items
                                        </Text>
                                    </HStack>

                                    <TableContainer w="100%">
                                        <Table variant="simple" size="sm">
                                            <Thead>
                                                <Tr bg={tableHeaderBg}>
                                                    <Th color={secondaryTextColor} borderColor={borderColor}>Item</Th>
                                                    <Th isNumeric color={secondaryTextColor} borderColor={borderColor}>Ordered</Th>
                                                    <Th isNumeric color={secondaryTextColor} borderColor={borderColor}>Received</Th>
                                                    <Th isNumeric color={secondaryTextColor} borderColor={borderColor}>Total Price (E)</Th>
                                                    <Th isNumeric color={secondaryTextColor} borderColor={borderColor}>Unit Price (E)</Th>
                                                    <Th color={secondaryTextColor} borderColor={borderColor}>Condition</Th>
                                                    <Th color={secondaryTextColor} borderColor={borderColor}>Batch No.</Th>
                                                    <Th color={secondaryTextColor} borderColor={borderColor}>Expiry Date</Th>
                                                </Tr>
                                            </Thead>
                                            <Tbody>
                                                {(formData.receivedItems || []).map(item => (
                                                    <Tr key={item._key} _hover={{ bg: tableHoverBg }}>
                                                        <Td borderColor={borderColor}>{item.stockItem?.name || 'Unknown Item'}</Td>
                                                        <Td isNumeric borderColor={borderColor}>{item.orderedQuantity || 0} ({item.stockItem.unitOfMeasure})</Td>
                                                        <Td borderColor={borderColor}>
                                                            <Input
                                                                value={item.receivedQuantity === 0 ? '' : item.receivedQuantity}
                                                                onChange={(e) => handleItemChange(item._key, 'receivedQuantity', e.target.value)}
                                                                type="number"
                                                                step="0.1"
                                                                min="0"
                                                                size="sm"
                                                                width="100px"
                                                                isDisabled={!isEditable}
                                                                bg={inputBg}
                                                                borderColor={borderColor}
                                                                placeholder="0"
                                                            />
                                                        </Td>
                                                        <Td borderColor={borderColor}>
                                                            <Input
                                                                value={item.totalPrice === 0 || item.totalPrice === undefined ? '' : item.totalPrice}
                                                                onChange={(e) => handleTotalPriceChange(item._key, e.target.value)}
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                size="sm"
                                                                width="100px"
                                                                isDisabled={!isEditable}
                                                                bg={inputBg}
                                                                borderColor={borderColor}
                                                                placeholder="0.00"
                                                            />
                                                        </Td>
                                                        <Td isNumeric borderColor={borderColor}>
                                                            <Text fontSize="sm">
                                                                E {(item.stockItem.unitPrice || 0).toFixed(2)}
                                                            </Text>
                                                            <Text fontSize="xs" color={secondaryTextColor}>
                                                                per {item.stockItem.unitOfMeasure}
                                                            </Text>
                                                            {item.unitPrice && item.unitPrice !== (item.stockItem.unitPrice || 0) && (
                                                                <Text fontSize="xs" color="orange.500">
                                                                    Saved: E {(item.unitPrice || 0).toFixed(2)}
                                                                </Text>
                                                            )}
                                                        </Td>
                                                        <Td borderColor={borderColor}>
                                                            <Select
                                                                value={item.condition}
                                                                onChange={(e) => handleItemChange(item._key, 'condition', e.target.value)}
                                                                size="sm"
                                                                isDisabled={!isEditable}
                                                                bg={inputBg}
                                                                borderColor={borderColor}
                                                            >
                                                                <option value="good">Good</option>
                                                                <option value="damaged">Damaged</option>
                                                            </Select>
                                                        </Td>
                                                        <Td borderColor={borderColor}>
                                                            <Input
                                                                type="text"
                                                                value={item.batchNumber || ''}
                                                                onChange={(e) => handleItemChange(item._key, 'batchNumber', e.target.value)}
                                                                size="sm"
                                                                isDisabled={!isEditable}
                                                                bg={inputBg}
                                                                borderColor={borderColor}
                                                            />
                                                        </Td>
                                                        <Td borderColor={borderColor}>
                                                            <Input
                                                                type="date"
                                                                value={item.expiryDate || ''}
                                                                onChange={(e) => handleItemChange(item._key, 'expiryDate', e.target.value)}
                                                                size="sm"
                                                                isDisabled={!isEditable}
                                                                bg={inputBg}
                                                                borderColor={borderColor}
                                                            />
                                                        </Td>
                                                    </Tr>
                                                ))}
                                            </Tbody>
                                        </Table>
                                    </TableContainer>

                                    <Box p={4} borderWidth={1} borderColor={borderColor} borderRadius="md" mt={4}>
                                        <HStack justify="space-between">
                                            <Text fontWeight="bold">Total Receipt Value:</Text>
                                            <Text fontWeight="bold" fontSize="lg">
                                                E {(formData.receivedItems || []).reduce((total, item) => {
                                                    const itemTotal = item.totalPrice || ((item.stockItem.unitPrice || 0) * item.receivedQuantity);
                                                    return total + itemTotal;
                                                }, 0).toFixed(2)}
                                            </Text>
                                        </HStack>
                                    </Box>
                                </Box>

                                {formData.attachments && formData.attachments.length > 0 && (
                                    <Box mt={4}>
                                        <Button
                                            variant="ghost"
                                            onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
                                            width="full"
                                            justifyContent="space-between"
                                            bg="gray.50"
                                            _hover={{ bg: "gray.100" }}
                                        >
                                            <HStack>
                                                <Text fontWeight="medium">Evidence Files & Invoices</Text>
                                                <Badge colorScheme="green" variant="solid">
                                                    {formData.attachments.length}
                                                </Badge>
                                            </HStack>
                                            <Icon as={isEvidenceExpanded ? FiChevronUp : FiChevronDown} />
                                        </Button>

                                        {isEvidenceExpanded && (
                                            <VStack spacing={4} mt={4} p={4} bg="gray.50" borderRadius="md">
                                                <Text fontSize="sm" color={secondaryTextColor} alignSelf="flex-start">
                                                    Proof of goods receipt and supplier invoices
                                                </Text>

                                                {formData.attachments.filter(attachment =>
                                                    isInvoiceAttachment(attachment.description || "")
                                                ).length > 0 && (
                                                        <Box w="100%">
                                                            <Text fontWeight="bold" mb={3} color="green.600">
                                                                Tracked Invoices
                                                            </Text>
                                                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="100%">
                                                                {formData.attachments
                                                                    .filter(attachment => isInvoiceAttachment(attachment.description || ""))
                                                                    .map((attachment) => {
                                                                        const invoiceInfo = getInvoiceDisplayInfo(attachment.description || "");
                                                                        const { url: fileUrl, type } = getAttachmentUrl(attachment);

                                                                        return (
                                                                            <Box
                                                                                key={attachment._id}
                                                                                borderWidth="2px"
                                                                                borderColor="green.200"
                                                                                borderRadius="lg"
                                                                                overflow="hidden"
                                                                                bg="green.50"
                                                                                boxShadow="sm"
                                                                            >
                                                                                <Box p={4} borderBottom="1px solid" borderColor="green.200">
                                                                                    <HStack align="start" spacing={3}>
                                                                                        <Icon as={FiDollarSign} color="green.500" mt={1} />
                                                                                        <VStack align="start" spacing={1} flex="1">
                                                                                            <Text fontWeight="bold" fontSize="sm">
                                                                                                Invoice: {invoiceInfo.metadata?.invoiceNumber}
                                                                                            </Text>
                                                                                            <Text fontSize="xs">Supplier: {invoiceInfo.metadata?.supplier}</Text>
                                                                                            <Text fontSize="xs">
                                                                                                Amount: E {invoiceInfo.metadata?.invoiceAmount?.toFixed(2)}
                                                                                            </Text>
                                                                                            <Text fontSize="xs">
                                                                                                Date: {new Date(invoiceInfo.metadata?.invoiceDate || '').toLocaleDateString()}
                                                                                            </Text>
                                                                                            {invoiceInfo.metadata?.userDescription && (
                                                                                                <Text fontSize="xs" mt={1}>
                                                                                                    {invoiceInfo.metadata.userDescription}
                                                                                                </Text>
                                                                                            )}
                                                                                        </VStack>
                                                                                    </HStack>
                                                                                </Box>
                                                                                <Box p={3}>
                                                                                    <HStack justify="space-between">
                                                                                        <Text fontSize="xs" color={secondaryTextColor}>
                                                                                            {attachment.fileName}
                                                                                        </Text>
                                                                                        {fileUrl && (
                                                                                            <Button
                                                                                                size="xs"
                                                                                                colorScheme="green"
                                                                                                variant="outline"
                                                                                                as="a"
                                                                                                href={fileUrl}
                                                                                                target="_blank"
                                                                                            >
                                                                                                View
                                                                                            </Button>
                                                                                        )}
                                                                                    </HStack>
                                                                                </Box>
                                                                            </Box>
                                                                        );
                                                                    })}
                                                            </SimpleGrid>
                                                        </Box>
                                                    )}

                                                {formData.attachments.filter(attachment =>
                                                    !isInvoiceAttachment(attachment.description || "")
                                                ).length > 0 && (
                                                        <Box w="100%">
                                                            <Text fontWeight="bold" mb={3} color="blue.600">
                                                                Evidence Files
                                                            </Text>
                                                            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} w="100%">
                                                                {formData.attachments
                                                                    .filter(attachment => !isInvoiceAttachment(attachment.description || ""))
                                                                    .map((attachment) => {
                                                                        const { url: fileUrl, type } = getAttachmentUrl(attachment);
                                                                        const isImage = type === 'image';
                                                                        const isFile = type === 'file';
                                                                        const fileExtension = attachment.fileName?.split('.').pop()?.toLowerCase() || 'file';
                                                                        const isPDF = fileExtension === 'pdf';
                                                                        const isDocument = ['doc', 'docx', 'txt'].includes(fileExtension);

                                                                        return (
                                                                            <Box
                                                                                key={attachment._id}
                                                                                borderWidth="1px"
                                                                                borderRadius="lg"
                                                                                overflow="hidden"
                                                                                bg="white"
                                                                                boxShadow="sm"
                                                                                position="relative"
                                                                            >
                                                                                {isImage && fileUrl ? (
                                                                                    <Image
                                                                                        src={fileUrl}
                                                                                        alt={attachment.fileName || 'Evidence photo'}
                                                                                        objectFit="cover"
                                                                                        width="100%"
                                                                                        height="200px"
                                                                                        loading="lazy"
                                                                                        onError={(e) => {
                                                                                            console.error('Image failed to load:', fileUrl);
                                                                                            e.currentTarget.style.display = 'none';
                                                                                        }}
                                                                                    />
                                                                                ) : (
                                                                                    <Box
                                                                                        height="200px"
                                                                                        bg={isPDF ? "red.50" : isDocument ? "blue.50" : "gray.100"}
                                                                                        display="flex"
                                                                                        alignItems="center"
                                                                                        justifyContent="center"
                                                                                        cursor={fileUrl ? "pointer" : "default"}
                                                                                        onClick={() => fileUrl && window.open(fileUrl, '_blank')}
                                                                                        borderBottom="1px solid"
                                                                                        borderColor="gray.200"
                                                                                        _hover={fileUrl ? { bg: isPDF ? "red.100" : isDocument ? "blue.100" : "gray.200" } : {}}
                                                                                    >
                                                                                        <VStack spacing={2}>
                                                                                            <Icon
                                                                                                as={FiFileText}
                                                                                                boxSize={8}
                                                                                                color={isPDF ? "red.400" : isDocument ? "blue.400" : secondaryTextColor}
                                                                                            />
                                                                                            <Text fontSize="sm" fontWeight="medium" textAlign="center">
                                                                                                {attachment.fileName || 'Document'}
                                                                                            </Text>
                                                                                            <Badge
                                                                                                colorScheme={isPDF ? "red" : isDocument ? "blue" : "gray"}
                                                                                                variant="subtle"
                                                                                            >
                                                                                                {fileExtension.toUpperCase()}
                                                                                            </Badge>
                                                                                            {fileUrl && (
                                                                                                <Text fontSize="xs" color="blue.500" mt={2}>
                                                                                                    Click to open
                                                                                                </Text>
                                                                                            )}
                                                                                        </VStack>
                                                                                    </Box>
                                                                                )}
                                                                                <Box p={3}>
                                                                                    <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                                                                                        {attachment.fileName || 'Evidence File'}
                                                                                    </Text>
                                                                                    <Text fontSize="xs" color={secondaryTextColor} mt={1}>
                                                                                        {attachment.description && !isInvoiceAttachment(attachment.description)
                                                                                            ? attachment.description
                                                                                            : (isImage ? 'Photo' : `${fileExtension.toUpperCase()} File`)
                                                                                        }
                                                                                    </Text>
                                                                                    {fileUrl && !isImage && (
                                                                                        <Text fontSize="xs" color="blue.500" mt={1}>
                                                                                            Click preview to download
                                                                                        </Text>
                                                                                    )}
                                                                                </Box>
                                                                            </Box>
                                                                        );
                                                                    })}
                                                            </SimpleGrid>
                                                        </Box>
                                                    )}
                                            </VStack>
                                        )}
                                    </Box>
                                )}
                            </VStack>
                        )}
                    </ModalBody>
                    <ModalFooter borderTopWidth="1px" borderColor={borderColor}>
                        <Button colorScheme="gray" mr={3} onClick={onClose} isDisabled={isSaving || isLoading} variant="outline">
                            Cancel
                        </Button>
                        <Button
                            colorScheme="blue"
                            variant="outline"
                            onClick={exportGoodsReceiptPDF}
                            isDisabled={!formData.purchaseOrder || (formData.receivedItems || []).length === 0}
                            leftIcon={<FiFileText />}
                        >
                            Export PDF
                        </Button>
                        <Button
                            colorScheme="green"
                            variant="outline"
                            onClick={() => setIsInvoiceModalOpen(true)}
                            leftIcon={<FiDollarSign />}
                            isDisabled={!formData.purchaseOrder}
                        >
                            Track Invoice
                        </Button>
                        {isEditable && (
                            <>
                                <Button
                                    colorScheme="brand" variant="outline" onClick={handleSaveDraft}
                                    isLoading={isSaving} leftIcon={<FiSave />}
                                    isDisabled={!formData.purchaseOrder || (formData.receivedItems || []).length === 0 || !formData.receivingBin}
                                >
                                    Save Draft
                                </Button>
                                <Button
                                    colorScheme="green"
                                    onClick={handleCompleteReceipt}
                                    isLoading={isSaving}
                                    isDisabled={!formData.purchaseOrder || (formData.receivedItems || []).length === 0 || !formData.receivingBin}
                                    leftIcon={<FiCheckCircle />}
                                >
                                    {isNewReceipt ? 'Save & Upload Evidence' : 'Upload Evidence & Complete'}
                                </Button>
                            </>
                        )}
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => {
                    setIsUploadModalOpen(false);
                    onSave();
                    onClose();
                }}
                onUploadComplete={handleFinalizeReceipt}
                relatedToId={savedReceiptId || formData._id || ''}
                fileType="receipt"
                title="Upload Receipt Evidence"
                description="Please upload photos or documents as evidence before completing the receipt. This will also mark the purchase order as completed."
            />

            <FileUploadModal
                isOpen={isInvoiceModalOpen}
                onClose={() => setIsInvoiceModalOpen(false)}
                onUploadComplete={handleInvoiceUploadComplete}
                relatedToId={savedReceiptId || formData._id || ''}
                fileType="invoice"
                title="Track Invoice"
                description="Upload supplier invoice for this goods receipt"
                invoiceData={{
                    supplier: displaySupplierName,
                }}
            />

            <BinSelectorModal
                isOpen={isBinSelectorOpen}
                onClose={() => setIsBinSelectorOpen(false)}
                onSelect={handleBinSelect}
            />
        </>
    );
}