// src/components/PasswordResetModal.tsx
'use client';

import { useState } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    FormControl,
    FormLabel,
    Input,
    VStack,
    Text,
    useToast,
    Alert,
    AlertIcon,
    HStack,
    useColorModeValue,
    ModalCloseButton, // Import useColorModeValue for theme-based colors
} from '@chakra-ui/react';

interface PasswordResetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PasswordResetModal({ isOpen, onClose }: PasswordResetModalProps) {
    const [email, setEmail] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    // Get theme-based colors for consistency
    const alertColorScheme = useColorModeValue('brand', 'brand');
    const brandColor = useColorModeValue('brand', 'brand');

    const handleSendCode = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/auth/send-verification-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Verification code sent.',
                    description: data.message,
                    status: 'success',
                    duration: 5000,
                    isClosable: true,
                });
                setIsCodeSent(true);
            } else {
                toast({
                    title: 'Error sending code.',
                    description: data.error || 'Please check the email address and try again.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: 'Request failed.',
                description: 'Unable to send verification code. Please try again later.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleResetPassword = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, verificationCode, newPassword }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Password reset successful.',
                    description: data.message,
                    status: 'success',
                    duration: 5000,
                    isClosable: true,
                });
                onClose();
            } else {
                toast({
                    title: 'Error resetting password.',
                    description: data.error || 'Invalid code or password. Please try again.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            toast({
                title: 'Request failed.',
                description: 'Unable to reset password. Please try again later.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>Reset Password</ModalHeader>
                <ModalCloseButton />
                <ModalBody>
                    <VStack spacing={4}>
                        <Alert status="info" colorScheme={alertColorScheme}>
                            <AlertIcon />
                            <Text>
                                Enter your email address to receive a verification code.
                            </Text>
                        </Alert>
                        <FormControl>
                            <FormLabel>Email Address</FormLabel>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                                isDisabled={isCodeSent || isLoading}
                            />
                        </FormControl>

                        {isCodeSent && (
                            <>
                                <FormControl>
                                    <FormLabel>Verification Code</FormLabel>
                                    <Input
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        placeholder="Enter the code from your email"
                                    />
                                </FormControl>
                                <FormControl>
                                    <FormLabel>New Password</FormLabel>
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Enter your new password"
                                    />
                                </FormControl>
                            </>
                        )}
                    </VStack>
                </ModalBody>
                <ModalFooter>
                    <HStack spacing={4}>
                        <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>
                            Cancel
                        </Button>
                        {!isCodeSent ? (
                            <Button
                                colorScheme={brandColor}
                                onClick={handleSendCode}
                                isLoading={isLoading}
                                isDisabled={!email}
                            >
                                Send Code
                            </Button>
                        ) : (
                            <Button
                                colorScheme={brandColor}
                                onClick={handleResetPassword}
                                isLoading={isLoading}
                                isDisabled={!verificationCode || !newPassword}
                            >
                                Reset Password
                            </Button>
                        )}
                    </HStack>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
}