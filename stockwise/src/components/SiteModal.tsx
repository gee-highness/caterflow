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
    useColorModeValue
} from '@chakra-ui/react';

interface Site {
    _id: string;
    name: string;
    location: string;
    manager: { _id: string; name: string };
    contactNumber?: string;
    email?: string;
    patientCount?: number;
}

interface SiteModalProps {
    isOpen: boolean;
    onClose: () => void;
    site: Site | null;
    onSave: () => void;
}

interface Manager {
    _id: string;
    name: string;
}

export default function SiteModal({ isOpen, onClose, site, onSave }: SiteModalProps) {
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [managerId, setManagerId] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [email, setEmail] = useState('');
    const [patientCount, setPatientCount] = useState<number | ''>('');
    const [loading, setLoading] = useState(false);
    const [managers, setManagers] = useState<Manager[]>([]);
    const toast = useToast();

    // Theme-aware colors
    const brandColorScheme = useColorModeValue('brand', 'brand');
    const neutralColorScheme = useColorModeValue('gray', 'gray');

    useEffect(() => {
        const fetchManagers = async () => {
            try {
                const response = await fetch('/api/users?role=siteManager');
                if (response.ok) {
                    const data = await response.json();
                    setManagers(data);
                } else {
                    throw new Error('Failed to fetch managers');
                }
            } catch (error) {
                console.error('Error fetching managers:', error);
                toast({
                    title: 'Error',
                    description: 'Failed to load managers',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        };
        fetchManagers();
    }, [toast]);

    useEffect(() => {
        if (site) {
            setName(site.name || '');
            setLocation(site.location || '');
            setManagerId(site.manager?._id || '');
            setContactNumber(site.contactNumber || '');
            setEmail(site.email || '');
            setPatientCount(site.patientCount ?? '');
        } else {
            // Reset form when modal is closed
            if (!isOpen) {
                setName('');
                setLocation('');
                setManagerId('');
                setContactNumber('');
                setEmail('');
                setPatientCount('');
            }
        }
    }, [site, isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const url = '/api/sites';
            const method = site ? 'PATCH' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    _id: site?._id,
                    name,
                    location,
                    manager: managerId || null,
                    contactNumber: contactNumber || null,
                    email: email || null,
                    patientCount: patientCount !== '' ? patientCount : null,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save site');
            }

            toast({
                title: site ? 'Site updated.' : 'Site created.',
                description: `Site "${name}" has been ${site ? 'updated' : 'created'}.`,
                status: 'success',
                duration: 3000,
                isClosable: true,
            });

            onSave();
            onClose();
        } catch (error: any) {
            console.error('Failed to save site:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to save site. Please try again.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>{site ? 'Edit Site' : 'Add New Site'}</ModalHeader>
                <ModalCloseButton />
                <form onSubmit={handleSave}>
                    <ModalBody pb={6}>
                        <FormControl isRequired mb={4}>
                            <FormLabel>Site Name</FormLabel>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Main Kitchen"
                            />
                        </FormControl>

                        <FormControl isRequired mb={4}>
                            <FormLabel>Location</FormLabel>
                            <Input
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g., 123 Main St, Anytown"
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Assigned Manager</FormLabel>
                            {managers.length > 0 ? (
                                <Select
                                    value={managerId}
                                    onChange={(e) => setManagerId(e.target.value)}
                                    placeholder="Select manager"
                                >
                                    {managers.map((m) => (
                                        <option key={m._id} value={m._id}>
                                            {m.name}
                                        </option>
                                    ))}
                                </Select>
                            ) : (
                                <Text>Loading managers...</Text>
                            )}
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Contact Number</FormLabel>
                            <Input
                                value={contactNumber}
                                onChange={(e) => setContactNumber(e.target.value)}
                                placeholder="e.g., +1234567890"
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Email Address</FormLabel>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="e.g., manager@site.com"
                            />
                        </FormControl>

                        <FormControl mb={4}>
                            <FormLabel>Current Patient Count</FormLabel>
                            <Input
                                type="number"
                                value={patientCount}
                                onChange={(e) => setPatientCount(parseInt(e.target.value) || '')}
                                placeholder="e.g., 150"
                            />
                        </FormControl>
                    </ModalBody>

                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={onClose} isDisabled={loading} colorScheme={neutralColorScheme}>
                            Cancel
                        </Button>
                        <Button colorScheme={brandColorScheme} type="submit" isLoading={loading}>
                            {site ? 'Update Site' : 'Add Site'}
                        </Button>
                    </ModalFooter>
                </form>
            </ModalContent>
        </Modal>
    );
}