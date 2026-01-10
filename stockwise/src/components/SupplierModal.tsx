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
    Textarea,
    useToast,
    useColorModeValue,
} from '@chakra-ui/react';

interface Supplier {
    _id: string;
    name: string;
    contactPerson?: string;
    phoneNumber?: string;
    email?: string;
    address?: string;
    terms?: string;
}

interface SupplierModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
    onSave: () => void;
}

export default function SupplierModal({ isOpen, onClose, supplier, onSave }: SupplierModalProps) {
    const [name, setName] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [address, setAddress] = useState('');
    const [terms, setTerms] = useState('');
    const [loading, setLoading] = useState(false);
    const toast = useToast();

    // Use theme-aware colors
    const brandColorScheme = useColorModeValue('brand', 'brand');
    const neutralColorScheme = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');

    useEffect(() => {
        if (supplier) {
            setName(supplier.name || '');
            setContactPerson(supplier.contactPerson || '');
            setPhoneNumber(supplier.phoneNumber || '');
            setEmail(supplier.email || '');
            setAddress(supplier.address || '');
            setTerms(supplier.terms || '');
        } else {
            setName('');
            setContactPerson('');
            setPhoneNumber('');
            setEmail('');
            setAddress('');
            setTerms('');
        }
    }, [supplier]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const url = '/api/suppliers';
            const method = supplier ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    _id: supplier?._id,
                    name,
                    contactPerson: contactPerson || undefined,
                    phoneNumber: phoneNumber || undefined,
                    email: email || undefined,
                    address: address || undefined,
                    terms: terms || undefined,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save supplier');
            }

            toast({
                title: supplier ? 'Supplier updated.' : 'Supplier created.',
                description: `Supplier "${name}" has been ${supplier ? 'updated' : 'created'}.`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

            onSave();
            onClose();
        } catch (error: any) {
            console.error('Failed to save supplier:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to save supplier. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg">
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{supplier ? 'Edit Supplier' : 'Add New Supplier'}</ModalHeader>
                <ModalCloseButton />
                <form onSubmit={handleSave}>
                    <ModalBody pb={6}>
                        <FormControl isRequired mb={4}>
                            <FormLabel>Supplier Name</FormLabel>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Food Supply Co."
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Contact Person</FormLabel>
                            <Input
                                value={contactPerson}
                                onChange={(e) => setContactPerson(e.target.value)}
                                placeholder="e.g., John Smith"
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Phone Number</FormLabel>
                            <Input
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                placeholder="e.g., +1234567890"
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Email Address</FormLabel>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="e.g., contact@supplier.com"
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Address</FormLabel>
                            <Textarea
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Full address"
                                rows={3}
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Terms & Conditions</FormLabel>
                            <Textarea
                                value={terms}
                                onChange={(e) => setTerms(e.target.value)}
                                placeholder="Payment terms, delivery conditions, etc."
                                rows={3}
                            />
                        </FormControl>
                    </ModalBody>

                    <ModalFooter>
                        <Button colorScheme={neutralColorScheme} mr={3} onClick={onClose} isDisabled={loading}>
                            Cancel
                        </Button>
                        <Button colorScheme={brandColorScheme} type="submit" isLoading={loading}>
                            {supplier ? 'Update Supplier' : 'Add Supplier'}
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}