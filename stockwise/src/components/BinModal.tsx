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
    Spinner,
    Text,
    useColorModeValue,
    VStack,
} from '@chakra-ui/react';

interface Bin {
    _id: string;
    name: string;
    binType: string;
    locationDescription: string;
    site: {
        _id: string;
        name: string;
    };
}

interface Site {
    _id: string;
    name: string;
}

interface BinModalProps {
    isOpen: boolean;
    onClose: () => void;
    bin: Bin | null;
    onSave: () => void;
    sites: Site[]; // Add sites as a prop
}

export default function BinModal({ isOpen, onClose, bin, onSave, sites }: BinModalProps) {
    const [name, setName] = useState('');
    const [binType, setBinType] = useState('');
    const [locationDescription, setLocationDescription] = useState('');
    const [siteId, setSiteId] = useState('');
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    // Theme-aware colors
    const modalBg = useColorModeValue('neutral.light.bg-secondary', 'neutral.dark.bg-secondary');
    const headerBg = useColorModeValue('neutral.light.bg-header', 'neutral.dark.bg-header');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const placeholderColor = useColorModeValue('neutral.light.text-placeholder', 'neutral.dark.text-placeholder');

    useEffect(() => {
        if (bin) {
            setName(bin.name || '');
            setBinType(bin.binType || '');
            setLocationDescription(bin.locationDescription || '');
            setSiteId(bin.site?._id || '');
        } else {
            // Reset form when modal is closed
            if (!isOpen) {
                setName('');
                setBinType('');
                setLocationDescription('');
                setSiteId('');
            }
        }
    }, [bin, isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const url = '/api/bins';
            const method = bin ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    _id: bin?._id,
                    name,
                    binType,
                    locationDescription: locationDescription || null,
                    site: siteId
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save bin');
            }

            toast({
                title: bin ? 'Bin updated.' : 'Bin created.',
                description: `Bin "${name}" has been ${bin ? 'updated' : 'created'}.`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

            onSave();
            onClose();
        } catch (error: any) {
            console.error('Failed to save bin:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to save bin. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size={{ base: 'full', md: 'xl' }}
            scrollBehavior="inside"
        >
            <ModalOverlay />
            <ModalContent bg={modalBg}>
                <ModalHeader
                    bg={headerBg}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                >
                    {bin ? 'Edit Bin' : 'Add New Bin'}
                </ModalHeader>
                <ModalCloseButton />
                <form onSubmit={handleSave}>
                    <ModalBody pb={6}>
                        <VStack spacing={4} mt={4} align="stretch">
                            <FormControl isRequired>
                                <FormLabel>Bin Name</FormLabel>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g., Main Storage"
                                    _placeholder={{ color: placeholderColor }}
                                />
                            </FormControl>

                            <FormControl isRequired>
                                <FormLabel>Bin Type</FormLabel>
                                <Select
                                    value={binType}
                                    onChange={(e) => setBinType(e.target.value)}
                                    placeholder="Select bin type"
                                >
                                    <option value="main-storage">Main Storage</option>
                                    <option value="overflow-storage">Overflow Storage</option>
                                    <option value="refrigerator">Refrigerator</option>
                                    <option value="freezer">Freezer</option>
                                    <option value="dispensing-point">Dispensing Point</option>
                                    <option value="receiving-area">Receiving Area</option>
                                </Select>
                            </FormControl>

                            <FormControl>
                                <FormLabel>Location Description</FormLabel>
                                <Input
                                    value={locationDescription}
                                    onChange={(e) => setLocationDescription(e.target.value)}
                                    placeholder="e.g., Near the entrance"
                                    _placeholder={{ color: placeholderColor }}
                                />
                            </FormControl>

                            <FormControl isRequired>
                                <FormLabel>Site</FormLabel>
                                {sites.length > 0 ? (
                                    <Select
                                        value={siteId}
                                        onChange={(e) => setSiteId(e.target.value)}
                                        placeholder="Select site"
                                    >
                                        {sites.map((site) => (
                                            <option key={site._id} value={site._id}>
                                                {site.name}
                                            </option>
                                        ))}
                                    </Select>
                                ) : (
                                    <Text>No sites available. Please add a site first.</Text>
                                )}
                            </FormControl>
                        </VStack>
                    </ModalBody>

                    <ModalFooter
                        borderTop="1px solid"
                        borderColor={borderColor}
                    >
                        <Button variant="ghost" mr={3} onClick={onClose} isDisabled={loading}>
                            Cancel
                        </Button>
                        <Button colorScheme="brand" type="submit" isLoading={loading}>
                            {bin ? 'Update Bin' : 'Add Bin'}
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}