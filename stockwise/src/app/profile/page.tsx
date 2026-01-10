'use client';

import { useState, useEffect } from 'react';
import {
    Box,
    Button,
    FormControl,
    FormLabel,
    Input,
    Heading,
    Text,
    Flex,
    useToast,
    Spinner,
    Stack,
    Alert,
    AlertIcon,
    Card,
    CardBody,
    VStack,
    Divider,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    InputGroup,
    InputRightElement,
    IconButton,
    useColorModeValue,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
    const { data: session, status } = useSession();
    const user = session?.user;
    const isAuthenticated = status === 'authenticated';
    const isAuthReady = status !== 'loading';

    const [activeTab, setActiveTab] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Password reset state
    const [verificationCode, setVerificationCode] = useState('');
    const [resetPassword, setResetPassword] = useState('');
    const [confirmResetPassword, setConfirmResetPassword] = useState('');
    const [isCodeSent, setIsCodeSent] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [showConfirmResetPassword, setShowConfirmResetPassword] = useState(false);

    const toast = useToast();
    const router = useRouter();

    // Theming values from theme.ts
    const bgPrimary = useColorModeValue('neutral.light.bg-primary', 'neutral.dark.bg-primary');
    const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const inputBg = useColorModeValue('neutral.light.bg-input', 'neutral.dark.bg-input');
    const inputBorderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const brand500 = useColorModeValue('brand.500', 'brand.300'); // Use theme's brand color for light/dark mode

    useEffect(() => {
        if (isAuthReady && !isAuthenticated) {
            router.push('/login?redirect=/profile');
        }
    }, [isAuthReady, isAuthenticated, router, status]);

    const handlePasswordChange = async (event: React.FormEvent) => {
        event.preventDefault();

        if (newPassword !== confirmPassword) {
            toast({
                title: 'Password mismatch.',
                description: 'New password and confirmation do not match.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPassword: currentPassword, newPassword }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Success!',
                    description: 'Your password has been changed successfully.',
                    status: 'success',
                    duration: 5000,
                    isClosable: true,
                });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast({
                    title: 'Failed to change password.',
                    description: data.message || 'An error occurred.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error('Password change failed:', error);
            toast({
                title: 'Failed to change password.',
                description: 'An unexpected error occurred.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSendCode = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/send-verification-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user?.email }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Verification code sent.',
                    description: 'Check your email for the verification code.',
                    status: 'success',
                    duration: 5000,
                    isClosable: true,
                });
                setIsCodeSent(true);
            } else {
                toast({
                    title: 'Failed to send code.',
                    description: data.message || 'An error occurred.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error('Error sending verification code:', error);
            toast({
                title: 'Network error.',
                description: 'Failed to connect to the server.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordReset = async (event: React.FormEvent) => {
        event.preventDefault();

        if (resetPassword !== confirmResetPassword) {
            toast({
                title: 'Password mismatch.',
                description: 'New password and confirmation do not match.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user?.email,
                    verificationCode,
                    newPassword: resetPassword
                }),
            });

            const data = await response.json();

            if (response.ok) {
                toast({
                    title: 'Success!',
                    description: 'Your password has been reset successfully.',
                    status: 'success',
                    duration: 5000,
                    isClosable: true,
                });
                setVerificationCode('');
                setResetPassword('');
                setConfirmResetPassword('');
                setIsCodeSent(false);
            } else {
                toast({
                    title: 'Failed to reset password.',
                    description: data.message || 'An error occurred.',
                    status: 'error',
                    duration: 5000,
                    isClosable: true,
                });
            }
        } catch (error) {
            console.error('Password reset failed:', error);
            toast({
                title: 'Failed to reset password.',
                description: 'An unexpected error occurred.',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAuthReady || (isAuthReady && !isAuthenticated)) {
        return (
            <Flex justifyContent="center" alignItems="center" height="100vh">
                <Spinner size="xl" color={brand500} />
            </Flex>
        );
    }

    return (
        <Box p={{ base: 3, md: 4 }} minH="100vh" bg={bgPrimary}>
            <VStack spacing={6} align="stretch" mx="auto" maxW="2xl">
                <Heading as="h1" size={{ base: 'md', md: 'lg' }} color={primaryTextColor}>
                    My Profile
                </Heading>

                <Card bg={bgCard} borderWidth="1px" borderColor={borderColor} boxShadow="md">
                    <CardBody>
                        <Alert status="info" borderRadius="md" variant="subtle" mb={6}>
                            <AlertIcon />
                            <Text color={primaryTextColor}>
                                Welcome, <strong>{user?.name}</strong>! Here you can manage your account settings.
                            </Text>
                        </Alert>

                        <Box mb={6}>
                            <Heading as="h2" size="md" mb={4} color={primaryTextColor}>
                                Account Details
                            </Heading>
                            <Stack spacing={3}>
                                <Flex alignItems="center">
                                    <Text fontWeight="bold" minW="100px" color={secondaryTextColor}>
                                        Name:
                                    </Text>
                                    <Text color={primaryTextColor}>{user?.name}</Text>
                                </Flex>
                                <Flex alignItems="center">
                                    <Text fontWeight="bold" minW="100px" color={secondaryTextColor}>
                                        Email:
                                    </Text>
                                    <Text color={primaryTextColor}>{user?.email}</Text>
                                </Flex>
                                <Flex alignItems="center">
                                    <Text fontWeight="bold" minW="100px" color={secondaryTextColor}>
                                        Role:
                                    </Text>
                                    <Text textTransform="capitalize" color={primaryTextColor}>
                                        {user?.role}
                                    </Text>
                                </Flex>
                                {user?.associatedSite && (
                                    <Flex alignItems="center">
                                        <Text fontWeight="bold" minW="100px" color={secondaryTextColor}>
                                            Site:
                                        </Text>
                                        <Text color={primaryTextColor}>{user.associatedSite.name}</Text>
                                    </Flex>
                                )}
                            </Stack>
                        </Box>

                        <Divider mb={6} borderColor={borderColor} />

                        <Tabs variant="enclosed" index={activeTab} onChange={setActiveTab}>
                            <TabList mb={4}>
                                <Tab
                                    _selected={{ color: brand500, borderColor: brand500 }}
                                    color={secondaryTextColor}
                                >
                                    Change Password
                                </Tab>
                                <Tab
                                    _selected={{ color: brand500, borderColor: brand500 }}
                                    color={secondaryTextColor}
                                >
                                    Reset Password
                                </Tab>
                            </TabList>

                            <TabPanels>
                                <TabPanel p={0}>
                                    <form onSubmit={handlePasswordChange}>
                                        <VStack spacing={4}>
                                            <FormControl id="current-password" isRequired>
                                                <FormLabel color={primaryTextColor}>Current Password</FormLabel>
                                                <InputGroup>
                                                    <Input
                                                        type={showCurrentPassword ? 'text' : 'password'}
                                                        value={currentPassword}
                                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                                        placeholder="Enter your current password"
                                                        bg={inputBg}
                                                        borderColor={inputBorderColor}
                                                        _hover={{ borderColor: brand500 }}
                                                        _focus={{ borderColor: brand500, boxShadow: `0 0 0 1px ${brand500}` }}
                                                        color={primaryTextColor}
                                                    />
                                                    <InputRightElement>
                                                        <IconButton
                                                            aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                                                            icon={showCurrentPassword ? <ViewOffIcon /> : <ViewIcon />}
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                                            color={secondaryTextColor}
                                                        />
                                                    </InputRightElement>
                                                </InputGroup>
                                            </FormControl>

                                            <FormControl id="new-password" isRequired>
                                                <FormLabel color={primaryTextColor}>New Password</FormLabel>
                                                <InputGroup>
                                                    <Input
                                                        type={showNewPassword ? 'text' : 'password'}
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        placeholder="Enter your new password"
                                                        bg={inputBg}
                                                        borderColor={inputBorderColor}
                                                        _hover={{ borderColor: brand500 }}
                                                        _focus={{ borderColor: brand500, boxShadow: `0 0 0 1px ${brand500}` }}
                                                        color={primaryTextColor}
                                                    />
                                                    <InputRightElement>
                                                        <IconButton
                                                            aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                                                            icon={showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                                            color={secondaryTextColor}
                                                        />
                                                    </InputRightElement>
                                                </InputGroup>
                                            </FormControl>

                                            <FormControl id="confirm-password" isRequired>
                                                <FormLabel color={primaryTextColor}>Confirm New Password</FormLabel>
                                                <InputGroup>
                                                    <Input
                                                        type={showConfirmPassword ? 'text' : 'password'}
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        placeholder="Confirm your new password"
                                                        bg={inputBg}
                                                        borderColor={inputBorderColor}
                                                        _hover={{ borderColor: brand500 }}
                                                        _focus={{ borderColor: brand500, boxShadow: `0 0 0 1px ${brand500}` }}
                                                        color={primaryTextColor}
                                                    />
                                                    <InputRightElement>
                                                        <IconButton
                                                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                                            icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                            color={secondaryTextColor}
                                                        />
                                                    </InputRightElement>
                                                </InputGroup>
                                            </FormControl>

                                            <Button
                                                colorScheme="brand"
                                                width="full"
                                                type="submit"
                                                isLoading={isLoading}
                                                loadingText="Changing password..."
                                                mt={2}
                                            >
                                                Change Password
                                            </Button>
                                        </VStack>
                                    </form>
                                </TabPanel>

                                <TabPanel p={0}>
                                    <form onSubmit={isCodeSent ? handlePasswordReset : handleSendCode}>
                                        <VStack spacing={4}>
                                            {!isCodeSent ? (
                                                <>
                                                    <Text color={secondaryTextColor} fontSize="sm">
                                                        A verification code will be sent to your email address to reset your password.
                                                    </Text>
                                                    <Button
                                                        colorScheme="brand"
                                                        width="full"
                                                        type="submit"
                                                        isLoading={isLoading}
                                                        loadingText="Sending code..."
                                                    >
                                                        Send Verification Code
                                                    </Button>
                                                </>
                                            ) : (
                                                <>
                                                    <Alert status="info" borderRadius="md" variant="subtle">
                                                        <AlertIcon />
                                                        <Text color={primaryTextColor}>
                                                            A verification code has been sent to your email.
                                                        </Text>
                                                    </Alert>

                                                    <FormControl id="verification-code" isRequired>
                                                        <FormLabel color={primaryTextColor}>Verification Code</FormLabel>
                                                        <Input
                                                            type="text"
                                                            value={verificationCode}
                                                            onChange={(e) => setVerificationCode(e.target.value)}
                                                            placeholder="Enter the code sent to your email"
                                                            bg={inputBg}
                                                            borderColor={inputBorderColor}
                                                            _hover={{ borderColor: brand500 }}
                                                            _focus={{ borderColor: brand500, boxShadow: `0 0 0 1px ${brand500}` }}
                                                            color={primaryTextColor}
                                                        />
                                                    </FormControl>

                                                    <FormControl id="reset-password" isRequired>
                                                        <FormLabel color={primaryTextColor}>New Password</FormLabel>
                                                        <InputGroup>
                                                            <Input
                                                                type={showResetPassword ? 'text' : 'password'}
                                                                value={resetPassword}
                                                                onChange={(e) => setResetPassword(e.target.value)}
                                                                placeholder="Enter your new password"
                                                                bg={inputBg}
                                                                borderColor={inputBorderColor}
                                                                _hover={{ borderColor: brand500 }}
                                                                _focus={{ borderColor: brand500, boxShadow: `0 0 0 1px ${brand500}` }}
                                                                color={primaryTextColor}
                                                            />
                                                            <InputRightElement>
                                                                <IconButton
                                                                    aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                                                                    icon={showResetPassword ? <ViewOffIcon /> : <ViewIcon />}
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setShowResetPassword(!showResetPassword)}
                                                                    color={secondaryTextColor}
                                                                />
                                                            </InputRightElement>
                                                        </InputGroup>
                                                    </FormControl>

                                                    <FormControl id="confirm-reset-password" isRequired>
                                                        <FormLabel color={primaryTextColor}>Confirm New Password</FormLabel>
                                                        <InputGroup>
                                                            <Input
                                                                type={showConfirmResetPassword ? 'text' : 'password'}
                                                                value={confirmResetPassword}
                                                                onChange={(e) => setConfirmResetPassword(e.target.value)}
                                                                placeholder="Confirm your new password"
                                                                bg={inputBg}
                                                                borderColor={inputBorderColor}
                                                                _hover={{ borderColor: brand500 }}
                                                                _focus={{ borderColor: brand500, boxShadow: `0 0 0 1px ${brand500}` }}
                                                                color={primaryTextColor}
                                                            />
                                                            <InputRightElement>
                                                                <IconButton
                                                                    aria-label={showConfirmResetPassword ? 'Hide password' : 'Show password'}
                                                                    icon={showConfirmResetPassword ? <ViewOffIcon /> : <ViewIcon />}
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => setShowConfirmResetPassword(!showConfirmResetPassword)}
                                                                    color={secondaryTextColor}
                                                                />
                                                            </InputRightElement>
                                                        </InputGroup>
                                                    </FormControl>

                                                    <Button
                                                        colorScheme="brand"
                                                        width="full"
                                                        type="submit"
                                                        isLoading={isLoading}
                                                        loadingText="Resetting password..."
                                                    >
                                                        Reset Password
                                                    </Button>
                                                </>
                                            )}
                                        </VStack>
                                    </form>
                                </TabPanel>
                            </TabPanels>
                        </Tabs>
                    </CardBody>
                </Card>
            </VStack>
        </Box>
    );
}