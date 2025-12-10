'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Heading,
    Text,
    Flex,
    Spinner,
    useToast,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    useDisclosure,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Icon,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    TableContainer,
    Button,
    HStack,
    VStack,
    Badge,
    useColorModeValue,
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react'
import { FiCheckCircle, FiXCircle, FiEye } from 'react-icons/fi';
import { FaBoxes } from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import DataTable from '../actions/DataTable';

// Update interfaces to match the new transfer structure
interface TransferredItem {
    _key: string;
    stockItem: {
        _id: string;
        name: string;
        unitOfMeasure: string;
    };
    transferredQuantity: number;
}

interface TransferApproval {
    _id: string;
    _type: 'InternalTransfer';
    transferNumber: string;
    transferDate: string;
    status: 'pending-approval';
    fromBin: {
        _id: string;
        name: string;
        site: {
            name: string;
        };
    };
    toBin: {
        _id: string;
        name: string;
        site: {
            name: string;
        };
    };
    transferredBy?: {
        name: string;
        email: string;
    } | null;
    transferredItems: TransferredItem[];
    notes?: string;
    createdAt: string;
}

interface PurchaseOrderApproval {
    _id: string;
    _type: 'PurchaseOrder';
    poNumber: string;
    title: string;
    description: string;
    status: 'pending-approval';
    orderedItems: any[];
    siteName: string;
    createdAt: string;
    priority: 'high' | 'medium' | 'low';
}

type ApprovalAction = TransferApproval | PurchaseOrderApproval;

export default function ApprovalsPage() {
    const { data: session, status } = useSession();
    const isAuthReady = status !== 'loading';
    const isAuthenticated = status === 'authenticated';
    const user = session?.user;

    const [pendingApprovals, setPendingApprovals] = useState<ApprovalAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedApproval, setSelectedApproval] = useState<ApprovalAction | null>(null);
    const [activeTab, setActiveTab] = useState(0);
    const { isOpen: isModalOpen, onOpen: onModalOpen, onClose: onModalClose } = useDisclosure();
    const toast = useToast();
    const router = useRouter();
    const [selectedApprovals, setSelectedApprovals] = useState<ApprovalAction[]>([]);

    const actionTypes = ['PurchaseOrder', 'InternalTransfer'];
    const actionTypeTitles: { [key: string]: string } = {
        'PurchaseOrder': 'Purchase Orders',
        'InternalTransfer': 'Internal Transfers',
    };

    const getActionTypeTitle = (type: string): string => {
        const titles: Record<string, string> = {
            PurchaseOrder: 'Purchase Orders',
            InternalTransfer: 'Internal Transfers',
        };
        return titles[type] || 'Items';
    };

    const fetchPendingApprovals = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (!user) {
                setLoading(false);
                return;
            }

            // Check if user has permission to view approvals
            if (user.role !== 'admin' && user.role !== 'siteManager' && user.role !== 'auditor') {
                router.push('/');
                return;
            }

            // Fetch both transfers AND purchase orders pending approval
            const [transfersResponse, purchaseOrdersResponse] = await Promise.all([
                fetch('/api/operations/transfers?status=pending-approval'),
                fetch(`/api/approvals?userSite=${user.associatedSite || ''}&userRole=${user.role || ''}`)
            ]);

            if (!transfersResponse.ok) {
                throw new Error('Failed to fetch transfers pending approval');
            }
            if (!purchaseOrdersResponse.ok) {
                throw new Error('Failed to fetch purchase orders pending approval');
            }

            const transfersData = await transfersResponse.json();
            const purchaseOrdersData = await purchaseOrdersResponse.json();

            // Transform transfers data
            const transferApprovals: TransferApproval[] = transfersData.map((transfer: any) => ({
                _id: transfer._id,
                _type: 'InternalTransfer',
                transferNumber: transfer.transferNumber || 'Unknown',
                transferDate: transfer.transferDate || new Date().toISOString(),
                status: 'pending-approval',
                fromBin: transfer.fromBin || { _id: 'unknown', name: 'Unknown Bin', site: { name: 'Unknown Site' } },
                toBin: transfer.toBin || { _id: 'unknown', name: 'Unknown Bin', site: { name: 'Unknown Site' } },
                transferredBy: transfer.transferredBy || null,
                transferredItems: transfer.items || transfer.transferredItems || [],
                notes: transfer.notes,
                createdAt: transfer.transferDate || new Date().toISOString(),
                title: `Transfer: ${transfer.transferNumber || 'Unknown'}`,
                description: `Transfer from ${transfer.fromBin?.name || 'Unknown'} to ${transfer.toBin?.name || 'Unknown'}`,
                siteName: transfer.fromBin?.site?.name || 'Unknown Site',
                priority: 'medium' as const,
            }));

            // Transform purchase orders data
            const purchaseOrderApprovals: PurchaseOrderApproval[] = purchaseOrdersData
                .filter((po: any) => po._type === 'PurchaseOrder')
                .map((po: any) => ({
                    _id: po._id,
                    _type: 'PurchaseOrder' as const,
                    poNumber: po.poNumber || 'Unknown',
                    title: po.title || `Purchase Order ${po.poNumber}`,
                    description: po.description || 'Purchase order for items',
                    status: 'pending-approval' as const,
                    orderedItems: po.orderedItems || [],
                    siteName: po.siteName || po.site?.name || 'Unknown Site',
                    createdAt: po.createdAt || po._createdAt || new Date().toISOString(),
                    priority: po.priority || 'medium',
                    // Add additional PO-specific fields
                    site: po.site,
                    orderedByName: po.orderedByName,
                    supplierNames: po.supplierNames,
                }));

            // Combine all approvals
            const allApprovals = [...transferApprovals, ...purchaseOrderApprovals];
            setPendingApprovals(allApprovals);

        } catch (err: any) {
            setError(err.message);
            toast({
                title: 'Error',
                description: err.message || 'Failed to fetch pending approvals',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    }, [user, router, toast]);

    useEffect(() => {
        if (status === 'loading') return;

        if (isAuthenticated) {
            fetchPendingApprovals();
        }
    }, [status, isAuthenticated, fetchPendingApprovals]);

    const handleOpenReview = (action: ApprovalAction) => {
        setSelectedApproval(action);
        onModalOpen();
    };

    const handleSelectionChange = (selectedItems: ApprovalAction[]) => {
        setSelectedApprovals(selectedItems);
    };

    // Update the handleApprove function
    const handleApprove = async () => {
        if (!selectedApproval) return;

        if (!canUserApprove(selectedApproval)) {
            toast({
                title: 'Permission Denied',
                description: 'You can only approve items from your site.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        try {
            let response;

            if (selectedApproval._type === 'InternalTransfer') {
                // Approve transfer
                response = await fetch(`/api/operations/transfers/${selectedApproval._id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'approved'
                    }),
                });
            } else {
                // Approve purchase order
                response = await fetch('/api/actions/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedApproval._id,
                        type: 'PurchaseOrder',
                        status: 'approved',
                        approvedBy: user?.id,
                        approvedAt: new Date().toISOString(),
                    }),
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to approve action');
            }

            toast({
                title: 'Action Approved',
                description: 'The item has been approved successfully.',
                status: 'success',
                duration: 5000,
                isClosable: true,
            });

            // Remove from pending approvals
            setPendingApprovals(prev => prev.filter(item => item._id !== selectedApproval._id));
            setSelectedApprovals(prev => prev.filter(item => item._id !== selectedApproval._id));
            onModalClose();
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to approve action. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    };

    // Update the handleReject function similarly
    const handleReject = async () => {
        if (!selectedApproval) return;

        // Quick permission check
        if (!canUserApprove(selectedApproval)) {
            toast({
                title: 'Permission Denied',
                description: 'You can only reject items from your site.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        try {
            let response;

            if (selectedApproval._type === 'InternalTransfer') {
                // Reject transfer
                response = await fetch(`/api/operations/transfers/${selectedApproval._id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'cancelled'
                    }),
                });
            } else {
                // Reject purchase order
                response = await fetch('/api/actions/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: selectedApproval._id,
                        type: 'PurchaseOrder',
                        status: 'cancelled',
                        rejectedBy: user?.id,
                        rejectedAt: new Date().toISOString(),
                    }),
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to reject action');
            }

            toast({
                title: 'Action Rejected',
                description: 'The item has been rejected.',
                status: 'info',
                duration: 5000,
                isClosable: true,
            });

            setPendingApprovals(prev => prev.filter(item => item._id !== selectedApproval._id));
            setSelectedApprovals(prev => prev.filter(item => item._id !== selectedApproval._id));
            onModalClose();
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message || 'Failed to reject action. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        }
    };


    // Add this function right after your other function declarations (after handleReject function)
    const canUserApprove = (approval: ApprovalAction | null): boolean => {
        if (!approval || !user) return false;

        // Admins and auditors can approve everything
        if (user.role === 'admin' || user.role === 'auditor') return true;

        // Site managers can only approve items from their site
        if (user.role === 'siteManager') {
            /*if (approval._type === 'InternalTransfer') {
                const transfer = approval as TransferApproval;
                const userSiteId = user.associatedSite?._id || user.associatedSite;
                const fromSiteId = transfer.fromBin?.site || transfer.fromBin?.site;
                return userSiteId === fromSiteId;
            } else if (approval._type === 'PurchaseOrder') {
                const po = approval as PurchaseOrderApproval;
                const userSiteId = user.associatedSite?._id || user.associatedSite;
                const poSiteId = po.siteName || po.siteName;
                return userSiteId === poSiteId;
            }*/

            return true;
        }

        return false;
    };

    // Helper function to get display information based on approval type with null checks
    const getApprovalDisplayInfo = (approval: ApprovalAction) => {
        if (approval._type === 'InternalTransfer') {
            return {
                referenceNumber: approval.transferNumber || 'Unknown',
                title: `Transfer: ${approval.transferNumber || 'Unknown'}`,
                description: `Transfer from ${approval.fromBin?.name || 'Unknown'} to ${approval.toBin?.name || 'Unknown'}`,
                siteName: approval.fromBin?.site?.name || 'Unknown Site',
                requestedBy: approval.transferredBy?.name || 'Unknown User',
            };
        } else {
            return {
                referenceNumber: approval.poNumber || 'Unknown',
                title: approval.title || 'Unknown Title',
                description: approval.description || 'No description',
                siteName: approval.siteName || 'Unknown Site',
                requestedBy: 'Unknown',
            };
        }
    };

    // Filter approvals by type for tabs
    const filteredApprovals = pendingApprovals.filter(action => {
        const type = actionTypes[activeTab];
        return action._type === type;
    });

    // Columns configuration for DataTable
    const getColumns = (type: string) => {
        const baseColumns = [
            {
                accessorKey: 'actions',
                header: 'Actions',
                isSortable: false,
                cell: (row: any) => (
                    <Button
                        size="sm"
                        colorScheme="brand"
                        variant="outline"
                        leftIcon={<FiEye />}
                        onClick={() => handleOpenReview(row)}
                    >
                        Review
                    </Button>
                )
            },
            {
                accessorKey: 'referenceNumber',
                header: 'Reference Number',
                isSortable: true,
                cell: (row: any) => {
                    const info = getApprovalDisplayInfo(row);
                    return info.referenceNumber;
                }
            },
            {
                accessorKey: 'description',
                header: 'Description',
                isSortable: true,
                cell: (row: any) => {
                    const info = getApprovalDisplayInfo(row);
                    return info.description;
                }
            },
            {
                accessorKey: 'siteName',
                header: 'Site',
                isSortable: true,
                cell: (row: any) => {
                    const info = getApprovalDisplayInfo(row);
                    return info.siteName;
                }
            },
            {
                accessorKey: 'requestedBy',
                header: 'Requested By',
                isSortable: true,
                cell: (row: any) => {
                    if (row._type === 'InternalTransfer') {
                        return row.transferredBy?.name || 'Unknown';
                    }
                    return 'Unknown';
                }
            },
            {
                accessorKey: 'createdAt',
                header: 'Created Date',
                isSortable: true,
                cell: (row: any) => new Date(row.createdAt).toLocaleDateString()
            },
        ];

        return baseColumns;
    };

    // Theming props
    const bgPrimary = useColorModeValue('neutral.light.bg-primary', 'neutral.dark.bg-primary');
    const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');

    if (status === 'loading' || loading) {
        return (
            <Flex justifyContent="center" alignItems="center" minH="100vh">
                <Spinner size="xl" />
            </Flex>
        );
    }

    if (!isAuthenticated) {
        return (
            <Flex justifyContent="center" alignItems="center" minH="100vh" direction="column">
                <Text fontSize="xl" color="red.500">
                    Please log in to view approvals
                </Text>
                <Button onClick={() => router.push('/login')} mt={4}>
                    Go to Login
                </Button>
            </Flex>
        );
    }

    if (user && (user.role !== 'admin' && user.role !== 'siteManager' && user.role !== 'auditor')) {
        return (
            <Flex justifyContent="center" alignItems="center" minH="100vh" direction="column">
                <Text fontSize="xl" color="red.500">
                    You don't have permission to view approvals
                </Text>
                <Button onClick={() => router.push('/')} mt={4}>
                    Go to Dashboard
                </Button>
            </Flex>
        );
    }

    return (
        <Box p={{ base: 3, md: 4 }} bg={bgPrimary} minH="100vh">
            <Heading as="h1" size={{ base: 'md', md: 'xl' }} mb={6} color={primaryTextColor}>
                Pending Approvals
            </Heading>

            <Tabs variant="enclosed" onChange={(index) => setActiveTab(index)} colorScheme="brand">
                <TabList>
                    {actionTypes.map((type, index) => (
                        <Tab key={type}>{actionTypeTitles[type]}</Tab>
                    ))}
                </TabList>
                <TabPanels>
                    {actionTypes.map((type, index) => (
                        <TabPanel key={type}>
                            {filteredApprovals.length === 0 ? (
                                <Text fontSize="lg" color="gray.500" py={8} textAlign="center">
                                    No pending {getActionTypeTitle(type).toLowerCase()} for approval.
                                </Text>
                            ) : (
                                <DataTable
                                    columns={getColumns(type)}
                                    data={filteredApprovals}
                                    loading={loading}
                                    onActionClick={handleOpenReview}
                                    onSelectionChange={handleSelectionChange}
                                />
                            )}
                        </TabPanel>
                    ))}
                </TabPanels>
            </Tabs>

            {/* Approval Details Modal */}
            <Modal isOpen={isModalOpen} onClose={onModalClose} size={{ base: 'full', md: '3xl', lg: '4xl' }}>
                <ModalOverlay />
                <ModalContent bg={bgCard}>
                    <ModalHeader borderBottomWidth="1px" borderColor={borderColor}>
                        <HStack spacing={2} alignItems="center">
                            <Icon as={FaBoxes} color="brand.500" />
                            <Text>
                                {selectedApproval?._type === 'InternalTransfer'
                                    ? `Transfer: ${selectedApproval.transferNumber || 'Unknown'}`
                                    : selectedApproval?.title || 'Approval Details'
                                }
                            </Text>
                        </HStack>
                    </ModalHeader>
                    <ModalBody>
                        <VStack spacing={4} align="stretch">
                            {/* Basic Information */}
                            <Flex justifyContent="space-between" flexWrap="wrap" gap={4}>
                                <Box>
                                    <Text fontWeight="bold" color={primaryTextColor}>Reference Number:</Text>
                                    <Text color={primaryTextColor}>
                                        {selectedApproval?._type === 'InternalTransfer'
                                            ? selectedApproval.transferNumber || 'Unknown'
                                            : selectedApproval?.poNumber || 'N/A'
                                        }
                                    </Text>
                                </Box>
                                <Box>
                                    <Text fontWeight="bold" color={primaryTextColor}>Status:</Text>
                                    <Badge colorScheme="orange" fontSize="sm">
                                        Pending Approval
                                    </Badge>
                                </Box>
                                <Box>
                                    <Text fontWeight="bold" color={primaryTextColor}>Site:</Text>
                                    <Text color={primaryTextColor}>
                                        {selectedApproval?._type === 'InternalTransfer'
                                            ? selectedApproval.fromBin?.site?.name || 'Unknown Site'
                                            : selectedApproval?.siteName || 'N/A'
                                        }
                                    </Text>
                                </Box>
                                <Box>
                                    <Text fontWeight="bold" color={primaryTextColor}>Requested By:</Text>
                                    <Text color={primaryTextColor}>
                                        {selectedApproval?._type === 'InternalTransfer'
                                            ? selectedApproval.transferredBy?.name || 'Unknown User'
                                            : 'Unknown'
                                        }
                                    </Text>
                                </Box>
                            </Flex>

                            {/* Transfer Specific Details */}
                            {selectedApproval?._type === 'InternalTransfer' && (
                                <>
                                    <Flex justifyContent="space-between" flexWrap="wrap" gap={4}>
                                        <Box>
                                            <Text fontWeight="bold" color={primaryTextColor}>From Bin:</Text>
                                            <Text color={primaryTextColor}>{selectedApproval.fromBin?.name || 'Unknown'}</Text>
                                        </Box>
                                        <Box>
                                            <Text fontWeight="bold" color={primaryTextColor}>To Bin:</Text>
                                            <Text color={primaryTextColor}>{selectedApproval.toBin?.name || 'Unknown'}</Text>
                                        </Box>
                                        <Box>
                                            <Text fontWeight="bold" color={primaryTextColor}>Transfer Date:</Text>
                                            <Text color={primaryTextColor}>
                                                {selectedApproval.transferDate
                                                    ? new Date(selectedApproval.transferDate).toLocaleDateString()
                                                    : 'Unknown Date'
                                                }
                                            </Text>
                                        </Box>
                                    </Flex>

                                    {selectedApproval.notes && (
                                        <Box>
                                            <Text fontWeight="bold" color={primaryTextColor}>Notes:</Text>
                                            <Text color={primaryTextColor}>{selectedApproval.notes}</Text>
                                        </Box>
                                    )}
                                </>
                            )}

                            {/* Purchase Order Specific Details */}
                            {selectedApproval?._type === 'PurchaseOrder' && (
                                <>
                                    <Flex justifyContent="space-between" flexWrap="wrap" gap={4}>
                                        <Box>
                                            <Text fontWeight="bold" color={primaryTextColor}>PO Number:</Text>
                                            <Text color={primaryTextColor}>{selectedApproval.poNumber || 'Unknown'}</Text>
                                        </Box>
                                    </Flex>
                                </>
                            )}

                            {/* Items Table - Combined for both types */}
                            <Box>
                                <Heading as="h4" size="sm" mb={3} color={primaryTextColor}>
                                    {selectedApproval?._type === 'InternalTransfer'
                                        ? 'Transferred Items'
                                        : 'Ordered Items'
                                    }
                                </Heading>
                                <TableContainer>
                                    <Table variant="simple" size="sm">
                                        <Thead>
                                            <Tr>
                                                <Th color={primaryTextColor}>Item Name</Th>
                                                <Th isNumeric color={primaryTextColor}>Quantity</Th>
                                                {selectedApproval?._type === 'InternalTransfer' && (
                                                    <Th color={primaryTextColor}>Unit</Th>
                                                )}
                                                {selectedApproval?._type === 'PurchaseOrder' && (
                                                    <>
                                                        <Th isNumeric color={primaryTextColor}>Unit Price</Th>
                                                        <Th isNumeric color={primaryTextColor}>Total</Th>
                                                    </>
                                                )}
                                            </Tr>
                                        </Thead>
                                        <Tbody>
                                            {/* Internal Transfer Items */}
                                            {selectedApproval?._type === 'InternalTransfer' && selectedApproval.transferredItems.map((item) => (
                                                <Tr key={item._key}>
                                                    <Td color={primaryTextColor}>{item.stockItem?.name || 'Unknown Item'}</Td>
                                                    <Td isNumeric color={primaryTextColor}>{item.transferredQuantity || 0}</Td>
                                                    <Td color={primaryTextColor}>{item.stockItem?.unitOfMeasure || 'Unknown'}</Td>
                                                </Tr>
                                            ))}

                                            {/* Purchase Order Items */}
                                            {selectedApproval?._type === 'PurchaseOrder' && selectedApproval.orderedItems?.map((item: any) => (
                                                <Tr key={item._key}>
                                                    <Td color={primaryTextColor}>{item.stockItem?.name || 'Unknown Item'}</Td>
                                                    <Td isNumeric color={primaryTextColor}>{item.orderedQuantity || 0}</Td>
                                                    <Td isNumeric color={primaryTextColor}>E {item.unitPrice?.toFixed(2) || '0.00'}</Td>
                                                    <Td isNumeric color={primaryTextColor}>E {((item.orderedQuantity || 0) * (item.unitPrice || 0)).toFixed(2)}</Td>
                                                </Tr>
                                            ))}

                                            {/* Empty state */}
                                            {((selectedApproval?._type === 'InternalTransfer' && selectedApproval.transferredItems.length === 0) ||
                                                (selectedApproval?._type === 'PurchaseOrder' && (!selectedApproval.orderedItems || selectedApproval.orderedItems.length === 0))) && (
                                                    <Tr>
                                                        <Td
                                                            colSpan={
                                                                selectedApproval?._type === 'InternalTransfer' ? 3 :
                                                                    selectedApproval?._type === 'PurchaseOrder' ? 4 : 1
                                                            }
                                                            textAlign="center"
                                                            color="gray.500"
                                                        >
                                                            No items found
                                                        </Td>
                                                    </Tr>
                                                )}
                                        </Tbody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        </VStack>
                    </ModalBody>
                    <ModalFooter borderTopWidth="1px" borderColor={borderColor}>
                        <Button
                            colorScheme="red"
                            onClick={handleReject}
                            leftIcon={<FiXCircle />}
                            isDisabled={!selectedApproval || !canUserApprove(selectedApproval)}
                        >
                            Reject
                        </Button>
                        <Button
                            colorScheme="green"
                            onClick={handleApprove}
                            ml={3}
                            leftIcon={<FiCheckCircle />}
                            isDisabled={!selectedApproval || !canUserApprove(selectedApproval)}
                        >
                            Approve
                        </Button>
                        <Button variant="ghost" ml={3} onClick={onModalClose}>
                            Close
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}