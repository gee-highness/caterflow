// src/components/DispatchModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
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
    IconButton,
    Text,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Box,
    Spinner,
    Grid,
    GridItem,
    Textarea,
    Divider,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    useColorModeValue,
    Icon, Image, SimpleGrid, Badge
} from '@chakra-ui/react';
import { FiFileText, FiPlus, FiTrash2, FiChevronUp, FiChevronDown } from 'react-icons/fi';
import StockItemSelectorModal from './StockItemSelectorModal';
import FileUploadModal from './FileUploadModal';
import { nanoid } from 'nanoid';
import { useSession } from 'next-auth/react';

import { urlFor } from '@/lib/sanity';

interface DispatchedItem {
    _key: string;
    stockItem: {
        _id: string;
        name: string;
        sku?: string;
        unitOfMeasure?: string;
        currentStock?: number;
        unitPrice?: number;
    };
    dispatchedQuantity: number;
    unitPrice?: number;
    totalCost?: number;
    notes?: string;
}

interface Site {
    _id: string;
    name: string;
}

interface Bin {
    _id: string;
    name: string;
    site: Site;
}

interface DispatchType {
    _id: string;
    name: string;
    description?: string;
    defaultTime: string;
    sellingPrice: number; // ADDED
}

interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
    associatedSite?: Site;
}

interface Dispatch {
    _id: string;
    dispatchNumber: string;
    dispatchDate: string;
    notes?: string;
    dispatchType: {
        _id: string;
        name: string;
    };
    dispatchedItems: DispatchedItem[];
    sourceBin: Bin;
    dispatchedBy: User;
    peopleFed?: number;
    evidenceStatus?: 'pending' | 'partial' | 'complete';
    status?: string;
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
}

interface DispatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    dispatch?: Dispatch | null;
    onSave: () => void;
    onToggleEvidence?: (dispatchId: string) => void;
    isEvidenceExpanded?: boolean;
}

export default function DispatchModal({
    isOpen,
    onClose,
    dispatch,
    onSave,
    onToggleEvidence,
    isEvidenceExpanded
}: DispatchModalProps) {
    const [loading, setLoading] = useState(false);
    const [dispatchTypes, setDispatchTypes] = useState<DispatchType[]>([]);
    const [allBins, setAllBins] = useState<Bin[]>([]);
    const [sourceBin, setSourceBin] = useState<Bin | null>(null);
    const [dispatchDate, setDispatchDate] = useState('');
    const [dispatchType, setDispatchType] = useState('');
    const [dispatchedItems, setDispatchedItems] = useState<DispatchedItem[]>([]);
    const [notes, setNotes] = useState('');
    const [peopleFed, setPeopleFed] = useState<number | undefined>(undefined);
    const [isStockItemModalOpen, setIsStockItemModalOpen] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [itemsLoading, setItemsLoading] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [savedDispatchId, setSavedDispatchId] = useState<string>('');
    const [selectedDispatchType, setSelectedDispatchType] = useState<DispatchType | null>(null); // ADDED
    const [isExporting, setIsExporting] = useState(false);

    const toast = useToast();
    const { data: session, status: sessionStatus } = useSession();
    const user = session?.user as unknown as User;
    const userSite = user?.associatedSite;
    const userRole = user?.role;

    const tableHeaderColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const tableBorderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const tableBg = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const textSecondaryColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const tableBoxShadow = useColorModeValue('md', 'dark-md');

    // Add these right after your existing useColorModeValue hooks (around line 85)
    const evidenceButtonBg = useColorModeValue('gray.50', 'gray.700');
    const evidenceButtonHoverBg = useColorModeValue('gray.100', 'gray.600');
    const evidenceSectionBg = useColorModeValue('gray.50', 'gray.800');
    const evidenceCardBg = useColorModeValue('white', 'gray.700');
    const fallbackBg = useColorModeValue('gray.100', 'gray.600');

    const existingItemIds = dispatchedItems.filter(item => item.stockItem).map(item => item.stockItem._id);

    // Safe number conversion helper function
    // Safe number conversion helper function with 3 decimal place support
    const safeNumber = (value: string | number): number => {
        if (typeof value === 'number') {
            return isNaN(value) ? 0 : parseFloat(value.toFixed(3));
        }
        const num = parseFloat(value);
        return isNaN(num) ? 0 : parseFloat(num.toFixed(3));
    };

    // Safe number input handler with 3 decimal place support
    const handleNumberInput = (value: string): number => {
        // Allow empty string, but convert to 0 for calculations
        if (value === '' || value === '-') return 0;

        // Parse as float
        const num = parseFloat(value);

        // Return 0 if NaN, otherwise round to 3 decimal places
        return isNaN(num) ? 0 : parseFloat(num.toFixed(3));
    };

    // load dispatch types and bins when modal opens
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [dispatchTypesRes, binsRes] = await Promise.all([
                    fetch('/api/dispatch-types'),
                    fetch('/api/bins')
                ]);

                if (!dispatchTypesRes.ok) throw new Error('Failed to fetch dispatch types');
                if (!binsRes.ok) throw new Error('Failed to fetch bins');

                const dispatchTypesData = await dispatchTypesRes.json();
                const binsData = await binsRes.json();

                setDispatchTypes(dispatchTypesData);
                setAllBins(binsData);

                // ADDED: Set selected dispatch type if editing
                if (dispatch?.dispatchType?._id) {
                    const currentType = dispatchTypesData.find((type: DispatchType) => type._id === dispatch.dispatchType._id);
                    setSelectedDispatchType(currentType || null);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                toast({
                    title: 'Error fetching data.',
                    description: 'Please try again later.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            } finally {
                setLoading(false);
            }
        };

        if (isOpen) {
            fetchData();
        }
    }, [isOpen, toast, dispatch?.dispatchType?._id]); // ADDED dependency

    // ADDED: Handler for dispatch type change
    const handleDispatchTypeChange = (typeId: string) => {
        setDispatchType(typeId);
        const selectedType = dispatchTypes.find(type => type._id === typeId);
        setSelectedDispatchType(selectedType || null);
    };

    // ADDED: Calculate total sales
    const calculateTotalSales = (): number => {
        if (!selectedDispatchType || !peopleFed) return 0;
        return peopleFed * selectedDispatchType.sellingPrice;
    };


    // initialize form from dispatch prop (edit) or defaults (new)
    useEffect(() => {
        if (dispatch) {
            setDispatchDate(dispatch.dispatchDate ? dispatch.dispatchDate.split('T')[0] : '');
            setDispatchType(dispatch.dispatchType?._id || '');
            setSourceBin(dispatch.sourceBin || null);
            setDispatchedItems(dispatch.dispatchedItems || []);
            setNotes(dispatch.notes || '');
            setPeopleFed(dispatch.peopleFed);
            setSavedDispatchId(dispatch._id || '');
        } else {
            const today = new Date().toISOString().split('T')[0];
            setDispatchDate(today);
            setDispatchType('');
            setSourceBin(null);
            setDispatchedItems([]);
            setNotes('');
            setPeopleFed(undefined);
            setEditingIndex(null);
            setSavedDispatchId('');
        }
    }, [dispatch, isOpen]);

    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();

        const fetchDefaultBin = async () => {
            if (!dispatch && sessionStatus === 'authenticated' && user?.associatedSite?._id) {
                setLoading(true);
                try {
                    const binRes = await fetch(
                        `/api/sites/${encodeURIComponent(user.associatedSite._id)}/main-bin`,
                        { signal: controller.signal }
                    );
                    if (!binRes.ok) throw new Error('Failed to fetch main bin');
                    const mainBin = await binRes.json();

                    if (mounted) {
                        setSourceBin(mainBin);
                    }
                } catch (error: any) {
                    if (error.name === 'AbortError') return;
                    console.log('Error fetching main bin:', error);
                    if (mounted) {
                        console.log('Error Setting Default Bin - ', error);
                    }
                } finally {
                    if (mounted) setLoading(false);
                }
            }
        };

        fetchDefaultBin();

        return () => {
            mounted = false;
            controller.abort();
        };
    }, [dispatch, sessionStatus, user?.associatedSite?._id, toast]);

    const isNew = !dispatch || dispatch._id?.startsWith?.('temp-');
    const isEditable = !(dispatch?.evidenceStatus === 'complete' || dispatch?.status === 'completed');

    // Update the handler functions:
    const handleUnitPriceChange = (key: string, value: string) => {
        // If current value is 0 and user starts typing, replace the 0
        const currentItem = dispatchedItems.find(item => item._key === key);
        const currentValue = currentItem?.unitPrice || 0;

        // If current value is 0 and user types a new digit, replace the 0
        if (currentValue === 0 && value !== '0' && value !== '' && !value.includes('.')) {
            // User is typing a new number, use the new value directly
            const valueAsNumber = handleNumberInput(value);
            setDispatchedItems(prevItems =>
                prevItems.map(item => {
                    if (item._key === key) {
                        const unitPrice = valueAsNumber;
                        const totalCost = unitPrice * (item.dispatchedQuantity || 0);
                        return {
                            ...item,
                            unitPrice,
                            totalCost
                        };
                    }
                    return item;
                })
            );
        } else {
            // Normal handling for other cases
            const valueAsNumber = handleNumberInput(value);
            setDispatchedItems(prevItems =>
                prevItems.map(item => {
                    if (item._key === key) {
                        const unitPrice = valueAsNumber;
                        const totalCost = unitPrice * (item.dispatchedQuantity || 0);
                        return {
                            ...item,
                            unitPrice,
                            totalCost
                        };
                    }
                    return item;
                })
            );
        }
    };

    const handleQuantityChange = (key: string, value: string) => {
        // Allow empty string for user typing
        if (value === '' || value === '-') {
            setDispatchedItems(prevItems =>
                prevItems.map(item => {
                    if (item._key === key) {
                        const unitPrice = item.unitPrice || 0;
                        return {
                            ...item,
                            dispatchedQuantity: 0,
                            totalCost: 0
                        };
                    }
                    return item;
                })
            );
            return;
        }

        // Check if the value has more than 3 decimal places
        const decimalParts = value.split('.');
        if (decimalParts.length === 2 && decimalParts[1].length > 3) {
            // Truncate to 3 decimal places
            value = decimalParts[0] + '.' + decimalParts[1].slice(0, 3);
        }

        // Parse the value as a float
        const valueAsNumber = parseFloat(value);

        // Only proceed if it's a valid number
        if (!isNaN(valueAsNumber) && valueAsNumber >= 0) {
            setDispatchedItems(prevItems =>
                prevItems.map(item => {
                    if (item._key === key) {
                        const unitPrice = item.unitPrice || 0;
                        const totalCost = unitPrice * valueAsNumber;
                        return {
                            ...item,
                            dispatchedQuantity: valueAsNumber,
                            totalCost: parseFloat(totalCost.toFixed(2)) // Round to 2 decimal places for currency
                        };
                    }
                    return item;
                })
            );
        }
    };

    // Updated people fed handler with decimal support and NaN protection
    const handlePeopleFedChange = (valueAsString: string) => {
        const valueAsNumber = handleNumberInput(valueAsString);
        setPeopleFed(valueAsNumber);
    };

    const calculateGrandTotal = (): number => {
        return dispatchedItems.reduce((total, item) => {
            return total + (item.totalCost || 0);
        }, 0);
    };

    const calculateCostPerPerson = (): number => {
        const grandTotal = calculateGrandTotal();
        return peopleFed && peopleFed > 0 ? grandTotal / peopleFed : 0;
    };

    // Stock item selection
    // In DispatchModal.tsx - Update the handleStockItemSelect function
    const handleStockItemSelect = (items: any[]) => {
        const newItems: DispatchedItem[] = items.map(item => {
            const unitPrice = safeNumber(item.unitPrice || 0);
            return {
                _key: nanoid(),
                stockItem: {
                    _id: item._id,
                    name: item.name,
                    sku: item.sku,
                    unitOfMeasure: item.unitOfMeasure,
                    currentStock: item.currentStock,
                    unitPrice: unitPrice,
                },
                dispatchedQuantity: 1,
                unitPrice: unitPrice,
                totalCost: unitPrice * 1,
                notes: '',
            };
        });

        setDispatchedItems(prevItems => {
            const updatedItems = [...prevItems];
            if (editingIndex !== null) {
                updatedItems[editingIndex] = newItems[0]; // For edit mode, use first item
                setEditingIndex(null);
            } else {
                updatedItems.push(...newItems);
            }
            return updatedItems;
        });

        setIsStockItemModalOpen(false);

        if (items.length > 1) {
            toast({
                title: 'Items added',
                description: `${items.length} items added to dispatch`,
                status: 'success',
                duration: 2000,
                isClosable: true,
            });
        }
    };

    const handleRemoveItem = (key: string) => {
        setDispatchedItems(prevItems => prevItems.filter(item => item._key !== key));
    };

    const handleNotesChange = (key: string, value: string) => {
        setDispatchedItems(prevItems =>
            prevItems.map(item =>
                item._key === key ? { ...item, notes: value } : item
            )
        );
    };

    const handleEditItem = (index: number) => {
        setEditingIndex(index);
        setIsStockItemModalOpen(true);
    };

    const isSubmitDisabled = !dispatchDate || !dispatchType || !sourceBin || dispatchedItems.length === 0 || !isEditable;

    // Save dispatch (create or update)
    const saveDispatch = async (status: string = 'draft') => {
        setIsSaving(true);
        try {
            if (!dispatchType || !sourceBin) {
                toast({
                    title: 'Missing Information',
                    description: 'Please select a dispatch type and source bin.',
                    status: 'warning',
                    duration: 5000,
                    isClosable: true,
                });
                throw new Error('Missing dispatch type or source bin');
            }

            const payload: any = {
                dispatchDate: new Date(dispatchDate).toISOString(),
                dispatchType: { _type: 'reference', _ref: dispatchType },
                sourceBin: { _type: 'reference', _ref: sourceBin?._id },
                dispatchedItems: dispatchedItems.map(item => ({
                    _type: 'DispatchedItem',
                    _key: item._key || nanoid(),
                    stockItem: {
                        _type: 'reference',
                        _ref: item.stockItem._id
                    },
                    dispatchedQuantity: safeNumber(item.dispatchedQuantity),
                    unitPrice: safeNumber(item.unitPrice || 0),
                    totalCost: safeNumber(item.totalCost || 0),
                    notes: item.notes || '',
                })),
                notes,
                peopleFed: safeNumber(peopleFed || 0),
                evidenceStatus: dispatch?.evidenceStatus || 'pending',
                status,
                dispatchedBy: { _type: 'reference', _ref: (session?.user as any)?.id || (session?.user as any)?._id || undefined },
                sellingPrice: selectedDispatchType?.sellingPrice || 0, // ADDED
                totalSales: calculateTotalSales(), // ADDED
            };

            let url = '/api/dispatches';
            let method: 'POST' | 'PATCH' = 'POST';

            if (!isNew && dispatch?._id) {
                url = `/api/dispatches/${dispatch._id}`;
                method = 'PATCH';
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to save dispatch');
            }

            const result = await res.json();
            const id = result._id || result.id || dispatch?._id;
            setSavedDispatchId(id);

            toast({
                title: status === 'draft' ? 'Draft saved' : 'Dispatch saved',
                status: 'success',
                duration: 2500,
                isClosable: true,
            });

            return result;
        } catch (error: any) {
            console.error('Save dispatch error:', error);
            toast({
                title: 'Error saving dispatch',
                description: error?.message || 'An error occurred',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            throw error;
        } finally {
            setIsSaving(false);
        }
    };

    // Submit handler for the form (create/update without completing)
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            const result = await saveDispatch('draft');
            setSavedDispatchId(result._id || result.id); // Ensure ID is set
            onSave();
            onClose();
        } catch {
            // saveDispatch already shows toast
        }
    };

    // Check all items dispatched (used to enable complete action)
    // Replace the existing isFullyDispatched function with:
    const isFullyDispatched = dispatchedItems.length > 0 &&
        dispatchedItems.every(item => item.dispatchedQuantity > 0) &&
        (peopleFed || 0) > 0; // ADD THIS LINE

    // Trigger the complete flow: ensure saved, then open upload modal
    const handleCompleteDispatch = async () => {
        if (!isFullyDispatched) {
            toast({
                title: 'Incomplete dispatch',
                description: 'You must set dispatched quantities for all items before completing.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        // This is the new validation for people fed
        if (!peopleFed || peopleFed <= 0) {
            toast({
                title: 'People fed required',
                description: 'You must specify how many people were fed before completing the dispatch.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        try {
            setIsSaving(true);
            if (isNew || !dispatch?._id) {
                const saved = await saveDispatch('draft');
                const id = saved._id || saved.id;
                setSavedDispatchId(id);
            } else {
                setSavedDispatchId(dispatch._id);
            }

            setIsUploadModalOpen(true);
        } catch (err) {
            // errors handled in saveDispatch
        } finally {
            setIsSaving(false);
        }
    };

    // Called by FileUploadModal when upload completes
    const handleFinalizeDispatch = async (attachmentIds: string[]) => {
        setIsUploadModalOpen(false);
        setIsSaving(true);

        try {
            const idToUse = savedDispatchId || dispatch?._id;
            if (!idToUse) throw new Error('No dispatch ID available to finalize');

            if (attachmentIds.length === 0) {
                throw new Error('No attachments uploaded');
            }

            const body: any = {
                evidenceStatus: 'complete',
                status: 'completed',
                completedAt: new Date().toISOString(),
                attachments: attachmentIds.map(id => ({ _type: 'reference', _ref: id })),
            };

            const res = await fetch(`/api/dispatches/${idToUse}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to finalize dispatch');
            }

            toast({
                title: 'Dispatch completed',
                description: `Evidence uploaded (${attachmentIds.length} files) and dispatch marked as complete.`,
                status: 'success',
                duration: 4000,
                isClosable: true,
            });

            onSave();
            onClose();
        } catch (error: any) {
            console.error('Finalize error:', error);
            toast({
                title: 'Error finalizing dispatch',
                description: error?.message || 'Failed to finalize dispatch',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const exportDispatchPDF = () => {
        if (isExporting) return;

        setIsExporting(true);
        try {
            const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Dispatch - ${dispatch?.dispatchNumber || 'New Dispatch'}</title>
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
            .summary-section {
                background: #F0FFF4;
                border: 1px solid #9AE6B4;
                border-radius: 8px;
                padding: 20px;
                margin: 20px 0;
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
                <h1>DISPATCH RECORD</h1>
                <p style="font-size: 16px; margin: 5px 0;">Dispatch Number: <strong>${dispatch?.dispatchNumber || 'New'}</strong></p>
                <p style="font-size: 14px; margin: 5px 0;">Date: ${new Date(dispatchDate).toLocaleDateString()}</p>
            </div>
        </div>
    
        <div class="info-section">
            <div class="info-grid">
                <div>
                    <div class="info-item">
                        <span class="info-label">Dispatch Type:</span>
                        <span> ${dispatchTypes.find(t => t._id === dispatchType)?.name || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Source Bin:</span>
                        <span> ${sourceBin?.name || 'N/A'} (${sourceBin?.site?.name || 'N/A'})</span>
                    </div>
                </div>
                <div>
                    <div class="info-item">
                        <span class="info-label">People Fed:</span>
                        <span> ${peopleFed || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Dispatched By:</span>
                        <span> ${user?.name || 'Current User'}</span>
                    </div>
                </div>
            </div>
        </div>
    
        <table class="table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total Cost</th>
                    <th>Unit</th>
                </tr>
            </thead>
            <tbody>
                ${dispatchedItems.map(item => `
                    <tr>
                        <td><strong>${item.stockItem.name}</strong></td>
                        <td>${item.dispatchedQuantity.toFixed(3)}</td>
                        <td>E ${(item.unitPrice || 0).toFixed(2)}</td>
                        <td>E ${(item.totalCost || 0).toFixed(2)}</td>
                        <td>${item.stockItem.unitOfMeasure}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    
        <div class="summary-section">
            <h3 style="margin: 0 0 15px 0; color: #22543D;">Cost Summary</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div>
                    <strong>Grand Total Cost:</strong>
                </div>
                <div>
                    <strong>E ${calculateGrandTotal().toFixed(2)}</strong>
                </div>
                ${peopleFed && peopleFed > 0 ? `
                    <div>Cost per Person:</div>
                    <div>E ${calculateCostPerPerson().toFixed(2)}</div>
                    <div>People Fed:</div>
                    <div>${peopleFed}</div>
                ` : ''}
            </div>
        </div>
    
        ${notes ? `
            <div class="info-section">
                <h3 style="margin: 0 0 12px 0; color: #2D3748; font-size: 16px;">Notes:</h3>
                <p style="margin: 0; color: #4A5568; line-height: 1.5;">${notes}</p>
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
                exportWindow.document.title = `Dispatch - ${dispatch?.dispatchNumber || 'New Dispatch'}`;

                // Reset exporting state after a short delay
                setTimeout(() => setIsExporting(false), 1000);
            } else {
                setIsExporting(false);
            }
        } catch (error) {
            console.error('Export failed:', error);
            setIsExporting(false);
        }
    };

    const getAttachmentUrl = (attachment: any): string | undefined => {
        console.log('Attachment data:', attachment);

        // If it's a Sanity file reference with asset
        if (attachment.file?.asset) {
            try {
                console.log('Asset found:', attachment.file.asset);

                // Check if it's an image asset
                if (attachment.file.asset._type === 'sanity.imageAsset') {
                    const url = urlFor(attachment.file.asset).url();
                    console.log('Generated image URL:', url);
                    return url;
                } else if (attachment.file.asset.url) {
                    // Use direct URL if available
                    console.log('Using asset URL:', attachment.file.asset.url);
                    return attachment.file.asset.url;
                }
            } catch (error) {
                console.error('Error generating image URL:', error);
            }
        }

        // Fallback to direct URL if available
        if (attachment.url) {
            console.log('Using direct URL:', attachment.url);
            return attachment.url;
        }

        console.log('No URL found for attachment');
        return undefined;
    };


    const filteredBins = userRole === 'admin'
        ? allBins
        : allBins.filter(bin => bin.site._id === userSite?._id);

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={() => {
                    // Refresh if a draft was saved during this session
                    if (savedDispatchId) {
                        onSave();
                    }
                    onClose();
                }}
                size={{ base: 'full', md: '4xl' }}
                closeOnOverlayClick={!isSaving && !isUploadModalOpen}
                scrollBehavior="outside"
                isCentered
            >
                <ModalOverlay />
                <ModalContent
                    maxH="90vh"
                    maxW={{ base: '100vw', md: '90vw', lg: '1200px' }}
                >
                    <ModalHeader>{dispatch ? 'Update Dispatch' : 'Create New Dispatch'}</ModalHeader>
                    <ModalCloseButton isDisabled={isSaving} />
                    {loading && !dispatch ? (
                        <Box p={8} textAlign="center">
                            <Spinner size="xl" />
                            <Text mt={4}>Loading form...</Text>
                        </Box>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <ModalBody
                                flex="1"
                                overflowY="auto"
                                maxH="calc(90vh - 160px)"
                                px={4}
                            >
                                <VStack spacing={4} align="stretch">
                                    <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                                        <GridItem>
                                            <FormControl isRequired>
                                                <FormLabel>Dispatch Type</FormLabel>
                                                <Select
                                                    placeholder="Select dispatch type"
                                                    value={dispatchType}
                                                    onChange={(e) => handleDispatchTypeChange(e.target.value)}
                                                    isDisabled={!isEditable || loading}
                                                >
                                                    {dispatchTypes.map((type) => (
                                                        <option key={type._id} value={type._id}>
                                                            {type.name} (E{type.sellingPrice}/person)
                                                        </option>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </GridItem>
                                        <GridItem>
                                            <FormControl isRequired>
                                                <FormLabel>Source Bin</FormLabel>
                                                <Select
                                                    placeholder={filteredBins.length === 0 ? "No bins available" : "Select source bin"}
                                                    value={sourceBin?._id || ''}
                                                    onChange={(e) => {
                                                        const selectedBin = filteredBins.find(bin => bin._id === e.target.value);
                                                        if (selectedBin) {
                                                            setSourceBin(selectedBin);
                                                        }
                                                    }}
                                                    isDisabled={!isEditable || loading || filteredBins.length === 0 || !!dispatch}
                                                >
                                                    {filteredBins.map((bin) => (
                                                        <option key={bin._id} value={bin._id}>
                                                            {bin.name} ({bin.site.name})
                                                        </option>
                                                    ))}
                                                </Select>
                                                {dispatch ? (
                                                    <Text fontSize="sm" color={textSecondaryColor} mt={1}>
                                                        Source bin cannot be changed for existing dispatches
                                                    </Text>
                                                ) : (
                                                    <>
                                                        {userSite && userRole !== 'admin' && (
                                                            <Text fontSize="sm" color={textSecondaryColor} mt={1}>
                                                                Your site: {userSite.name}
                                                            </Text>
                                                        )}
                                                        {userRole === 'admin' && (
                                                            <Text fontSize="sm" color={textSecondaryColor} mt={1}>
                                                                Admin: All bins available
                                                            </Text>
                                                        )}
                                                        {filteredBins.length === 0 && (
                                                            <Text fontSize="sm" color="red.500" mt={1}>
                                                                No bins available for your site
                                                            </Text>
                                                        )}
                                                    </>
                                                )}
                                            </FormControl>
                                        </GridItem>
                                    </Grid>

                                    <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                                        <GridItem>
                                            <FormControl isRequired>
                                                <FormLabel>Dispatch Date</FormLabel>
                                                <Input
                                                    type="date"
                                                    value={dispatchDate}
                                                    onChange={(e) => setDispatchDate(e.target.value)}
                                                    isDisabled={!isEditable || loading}
                                                />
                                            </FormControl>
                                        </GridItem>
                                        <GridItem>
                                            <FormControl>
                                                <FormLabel>People Fed</FormLabel>
                                                <NumberInput
                                                    value={peopleFed || 0}
                                                    min={0}
                                                    onChange={handlePeopleFedChange}
                                                    isDisabled={!isEditable || loading}
                                                    precision={0}
                                                    step={1}
                                                >
                                                    <NumberInputField />
                                                    <NumberInputStepper>
                                                        <NumberIncrementStepper />
                                                        <NumberDecrementStepper />
                                                    </NumberInputStepper>
                                                </NumberInput>
                                            </FormControl>
                                        </GridItem>
                                    </Grid>

                                    <FormControl>
                                        <FormLabel>Notes</FormLabel>
                                        <Textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Add any notes about this dispatch..."
                                            isDisabled={!isEditable || loading}
                                        />
                                    </FormControl>

                                    <Divider />

                                    <VStack spacing={4} align="stretch">
                                        <HStack justify="space-between" align="center">
                                            <FormLabel mb={0}>Dispatched Items</FormLabel>
                                            {itemsLoading && (
                                                <Spinner size="sm" />
                                            )}
                                        </HStack>

                                        {dispatchedItems.length === 0 ? (
                                            <Box textAlign="center" py={4} color={textSecondaryColor}>
                                                No items added yet
                                            </Box>
                                        ) : (
                                            <TableContainer
                                                bg={tableBg}
                                                borderRadius="lg"
                                                boxShadow={tableBoxShadow}
                                                border="1px solid"
                                                borderColor={tableBorderColor}
                                            >
                                                <Table variant="simple" size="sm">
                                                    <Thead>
                                                        <Tr>
                                                            <Th color={tableHeaderColor} borderColor={tableBorderColor}>Item</Th>
                                                            <Th color={tableHeaderColor} borderColor={tableBorderColor}>Unit Price</Th>
                                                            <Th color={tableHeaderColor} borderColor={tableBorderColor}>Quantity</Th>
                                                            <Th color={tableHeaderColor} borderColor={tableBorderColor}>Total Cost</Th>
                                                            <Th color={tableHeaderColor} borderColor={tableBorderColor}>Unit</Th>
                                                            <Th color={tableHeaderColor} borderColor={tableBorderColor}> </Th>
                                                        </Tr>
                                                    </Thead>
                                                    <Tbody>
                                                        {dispatchedItems.map((item, index) => (
                                                            <Tr key={item._key}>
                                                                <Td borderColor={tableBorderColor}>{item.stockItem.name}</Td>
                                                                <Td borderColor={tableBorderColor}>
                                                                    <Input
                                                                        value={item.unitPrice || 0}
                                                                        onChange={(e) => handleUnitPriceChange(item._key, e.target.value)}
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        size="sm"
                                                                        width="100px"
                                                                        isDisabled={true}
                                                                    />
                                                                </Td>

                                                                <Td borderColor={tableBorderColor}>
                                                                    <NumberInput
                                                                        value={item.dispatchedQuantity}
                                                                        onChange={(valueString) => handleQuantityChange(item._key, valueString)}
                                                                        min={0}
                                                                        step={0.001}
                                                                        precision={3}
                                                                        size="sm"
                                                                        width="100px"
                                                                        isDisabled={!isEditable}
                                                                    >
                                                                        <NumberInputField />
                                                                        <NumberInputStepper>
                                                                            <NumberIncrementStepper />
                                                                            <NumberDecrementStepper />
                                                                        </NumberInputStepper>
                                                                    </NumberInput>
                                                                </Td>
                                                                <Td borderColor={tableBorderColor}>
                                                                    <Text fontWeight="medium">
                                                                        E {(item.totalCost || 0).toFixed(2)}
                                                                    </Text>
                                                                </Td>
                                                                <Td borderColor={tableBorderColor}>{item.stockItem.unitOfMeasure}</Td>
                                                                <Td borderColor={tableBorderColor}>
                                                                    <HStack>
                                                                        <IconButton
                                                                            aria-label="Remove item"
                                                                            icon={<FiTrash2 />}
                                                                            size="sm"
                                                                            onClick={() => handleRemoveItem(item._key)}
                                                                            isDisabled={!isEditable}
                                                                        />
                                                                    </HStack>
                                                                </Td>
                                                            </Tr>
                                                        ))}
                                                    </Tbody>
                                                </Table>
                                            </TableContainer>
                                        )}

                                        {/* Cost Summary Section */}
                                        {dispatchedItems.length > 0 && (
                                            <VStack align="stretch" mt={4} p={4} borderRadius="md">
                                                <HStack justify="space-between">
                                                    <Text fontWeight="bold">Grand Total Cost:</Text>
                                                    <Text fontWeight="bold" fontSize="lg">
                                                        E{calculateGrandTotal().toFixed(2)}
                                                    </Text>
                                                </HStack>

                                                {peopleFed && peopleFed > 0 ? (
                                                    <>
                                                        <HStack justify="space-between">
                                                            <Text>Cost per Person:</Text>
                                                            <Text fontWeight="medium">
                                                                E {calculateCostPerPerson().toFixed(2)}
                                                            </Text>
                                                        </HStack>
                                                        <Text fontSize="sm" color="gray.600">
                                                            Based on {peopleFed} people fed
                                                        </Text>
                                                    </>
                                                ) : (
                                                    <Text fontSize="sm" color="gray.600" fontStyle="italic">
                                                        No people fed specified
                                                    </Text>
                                                )}
                                            </VStack>
                                        )}

                                        {dispatch?.attachments && dispatch.attachments.length > 0 && (
                                            <Box mt={4}>
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => dispatch?._id && onToggleEvidence?.(dispatch._id)}
                                                    width="full"
                                                    justifyContent="space-between"
                                                    bg="gray.50"
                                                    _hover={{ bg: "gray.100" }}
                                                >
                                                    <HStack>
                                                        <Text fontWeight="medium">Evidence Photos</Text>
                                                        <Badge colorScheme="green" variant="solid">
                                                            {dispatch.attachments.length}
                                                        </Badge>
                                                    </HStack>
                                                    <Icon as={isEvidenceExpanded ? FiChevronUp : FiChevronDown} />
                                                </Button>

                                                {isEvidenceExpanded && (
                                                    <VStack spacing={4} mt={4} p={4} bg="gray.50" borderRadius="md">
                                                        <Text fontSize="sm" color={textSecondaryColor} alignSelf="flex-start">
                                                            Proof of dispatch completion
                                                        </Text>
                                                        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4} w="100%">
                                                            {dispatch.attachments.map((attachment) => {
                                                                const imageUrl = getAttachmentUrl(attachment);
                                                                const isImage = imageUrl !== undefined;

                                                                return (
                                                                    <Box
                                                                        key={attachment._id}
                                                                        borderWidth="1px"
                                                                        borderRadius="lg"
                                                                        overflow="hidden"
                                                                        bg="white"
                                                                        boxShadow="sm"
                                                                    >
                                                                        {isImage ? (
                                                                            <Image
                                                                                src={imageUrl}
                                                                                alt={'Evidence photo'}
                                                                                objectFit="cover"
                                                                                width="100%"
                                                                                height="200px"
                                                                                onError={(e) => {
                                                                                    console.error('Image failed to load:', imageUrl);
                                                                                    e.currentTarget.style.display = 'none';
                                                                                }}
                                                                                onLoad={() => console.log('Image loaded successfully:', imageUrl)}
                                                                            />
                                                                        ) : (
                                                                            <Box
                                                                                height="200px"
                                                                                bg="gray.100"
                                                                                display="flex"
                                                                                alignItems="center"
                                                                                justifyContent="center"
                                                                            >
                                                                                <VStack spacing={2}>
                                                                                    <Icon as={FiFileText} boxSize={8} color={textSecondaryColor} />
                                                                                    <Text fontSize="sm" color={textSecondaryColor}>
                                                                                        {'Document'}
                                                                                    </Text>
                                                                                    <Text fontSize="xs" color={textSecondaryColor}>
                                                                                        {'File'}
                                                                                    </Text>
                                                                                </VStack>
                                                                            </Box>
                                                                        )}
                                                                        <Box p={3}>
                                                                            <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                                                                                {'Evidence File'}
                                                                            </Text>
                                                                            <Text fontSize="xs" color={textSecondaryColor} mt={1}>
                                                                                {isImage ? 'Photo' : 'Document'}
                                                                            </Text>
                                                                        </Box>
                                                                    </Box>
                                                                );
                                                            })}
                                                        </SimpleGrid>
                                                    </VStack>
                                                )}
                                            </Box>
                                        )}

                                        {selectedDispatchType && peopleFed && peopleFed > 0 && (
                                            <VStack align="stretch" mt={4} p={4} borderRadius="md" bg="green.50" border="1px" borderColor="green.200">
                                                <HStack justify="space-between">
                                                    <Text fontWeight="bold" color="green.800">Estimated Sales:</Text>
                                                    <Text fontWeight="bold" fontSize="lg" color="green.800">
                                                        E{calculateTotalSales().toFixed(2)}
                                                    </Text>
                                                </HStack>
                                                <HStack justify="space-between">
                                                    <Text fontSize="sm" color="green.700">Selling Price:</Text>
                                                    <Text fontSize="sm" color="green.700">E{selectedDispatchType.sellingPrice}/person</Text>
                                                </HStack>
                                                <HStack justify="space-between">
                                                    <Text fontSize="sm" color="green.700">People Fed:</Text>
                                                    <Text fontSize="sm" color="green.700">{peopleFed}</Text>
                                                </HStack>
                                            </VStack>
                                        )}


                                        <Button
                                            leftIcon={<FiPlus />}
                                            onClick={() => setIsStockItemModalOpen(true)}
                                            variant="outline"
                                            isDisabled={loading || !sourceBin || !isEditable}
                                            alignSelf="flex-start"
                                        >
                                            Add Item
                                        </Button>
                                    </VStack>
                                </VStack>
                            </ModalBody>

                            <ModalFooter
                                position="sticky"
                                bottom="0"
                                bg="white"
                                borderTop="1px solid"
                                borderTopColor="gray.200"
                                zIndex="sticky"
                                py={4}
                                px={4}
                            >
                                <Button variant="outline" mr={3} onClick={onClose} isDisabled={isSaving || loading}>
                                    Cancel
                                </Button>
                                <Button
                                    colorScheme="blue"
                                    variant="outline"
                                    onClick={exportDispatchPDF}
                                    isDisabled={dispatchedItems.length === 0 || isExporting || isSaving || loading}
                                    isLoading={isExporting}
                                    loadingText="Exporting..."
                                    leftIcon={<FiFileText />}
                                >
                                    Export PDF
                                </Button>
                                {isEditable ? (
                                    <>
                                        <Button
                                            colorScheme="blue"
                                            type="submit"
                                            isLoading={isSaving}
                                            isDisabled={isSubmitDisabled}
                                            loadingText={dispatch ? "Updating..." : "Creating..."}
                                            mr={3}
                                            ml={3}
                                        >
                                            {dispatch ? 'Update Dispatch' : 'Create Dispatch'}
                                        </Button>

                                        <Button
                                            colorScheme="green"
                                            onClick={handleCompleteDispatch}
                                            isLoading={isSaving}
                                            isDisabled={!isFullyDispatched || dispatchedItems.length === 0 || isSaving}
                                        >
                                            {isNew ? 'Save & Upload Evidence' : 'Upload Evidence & Complete'}
                                        </Button>
                                    </>
                                ) : (
                                    <Text color={textSecondaryColor} fontSize="sm">Dispatch is completed — read-only.</Text>
                                )}
                            </ModalFooter>
                        </form>
                    )}
                </ModalContent>
            </Modal>

            <StockItemSelectorModal
                isOpen={isStockItemModalOpen}
                onClose={() => {
                    setIsStockItemModalOpen(false);
                    setEditingIndex(null);
                }}
                onSelect={handleStockItemSelect}
                existingItemIds={existingItemIds}
                sourceBinId={sourceBin?._id}
            />

            <FileUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => {
                    setIsUploadModalOpen(false);
                    // Refresh and close main modal when upload is cancelled
                    onSave();
                    onClose();
                }}
                onUploadComplete={handleFinalizeDispatch}
                relatedToId={savedDispatchId || dispatch?._id || ''}
                fileType="other"
                title="Upload Dispatch Evidence"
                description="Please upload photos or documents as evidence before completing the dispatch."
            />
        </>
    );
}