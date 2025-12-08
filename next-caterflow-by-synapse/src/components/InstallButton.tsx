// src/components/InstallButton.tsx
'use client';

import React, { useState } from 'react';
import {
	Button,
	useToast,
	useColorModeValue,
	Box,
	Text,
	VStack,
	useBreakpointValue,
	Badge,
	Flex,
	Modal,
	ModalOverlay,
	ModalContent,
	ModalHeader,
	ModalFooter,
	ModalBody,
	ModalCloseButton,
	useDisclosure,
	HStack,
} from '@chakra-ui/react';
import { FiDownload, FiSmartphone, FiCheck } from 'react-icons/fi';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function InstallButton() {
	const { isInstallable, isInstalled, promptInstall } = usePWAInstall();
	const toast = useToast();
	const { isOpen, onOpen, onClose } = useDisclosure();
	const [isInstalling, setIsInstalling] = useState(false);

	// Responsive button size - moved before any conditional returns
	const buttonSize = useBreakpointValue({ base: 'sm', md: 'md' });
	const isMobile = useBreakpointValue({ base: true, md: false });

	// Theme colors - moved before any conditional returns
	const iosBgColor = useColorModeValue('gray.50', 'gray.700');
	const androidBgColor = useColorModeValue('gray.50', 'gray.700');
	const textColor = useColorModeValue('gray.600', 'gray.400');

	const handleInstallClick = async () => {
		if (isInstalled) {
			toast({
				title: 'App already installed',
				description: 'Caterflow is already installed on your device.',
				status: 'info',
				duration: 3000,
				isClosable: true,
			});
			return;
		}

		setIsInstalling(true);
		try {
			const installed = await promptInstall();
			if (installed) {
				toast({
					title: 'Installation started',
					description: 'Caterflow is being installed on your device.',
					status: 'success',
					duration: 3000,
					isClosable: true,
				});
			} else {
				// If prompt wasn't shown, show instructions
				onOpen();
			}
		} catch (error) {
			console.error('Installation error:', error);
			toast({
				title: 'Installation failed',
				description: 'Failed to install the app. Please try again.',
				status: 'error',
				duration: 3000,
				isClosable: true,
			});
		} finally {
			setIsInstalling(false);
		}
	};

	// Only show on mobile devices and when installable
	if (!isMobile || isInstalled) {
		return null;
	}

	return (
		<>
			<Box position="fixed" bottom="20px" right="20px" zIndex={1000}>
				{isInstallable && (
					<Button
						onClick={handleInstallClick}
						colorScheme="brand"
						leftIcon={<FiDownload />}
						size={buttonSize}
						isLoading={isInstalling}
						loadingText="Installing..."
						boxShadow="lg"
						borderRadius="full"
						px={6}
						py={4}
						_hover={{
							transform: 'translateY(-2px)',
							boxShadow: 'xl',
						}}
						transition="all 0.2s"
					>
						<VStack spacing={0} align="center">
							<Text fontWeight="bold">Install App</Text>
							<Text fontSize="xs" opacity={0.8}>For better experience</Text>
						</VStack>
					</Button>
				)}

				{/* Fallback badge when not installable via prompt */}
				{!isInstallable && !isInstalled && (
					<Button
						onClick={onOpen}
						colorScheme="blue"
						variant="outline"
						leftIcon={<FiSmartphone />}
						size={buttonSize}
						boxShadow="md"
						borderRadius="full"
						px={6}
						py={4}
					>
						Install App
					</Button>
				)}
			</Box>

			{/* Installation instructions modal */}
			<Modal isOpen={isOpen} onClose={onClose} size="md">
				<ModalOverlay />
				<ModalContent>
					<ModalHeader>Install Caterflow App</ModalHeader>
					<ModalCloseButton />
					<ModalBody>
						<VStack spacing={4} align="stretch">
							<Text>
								To install Caterflow as an app on your device:
							</Text>

							<Box p={4} bg={iosBgColor} borderRadius="md">
								<Text fontWeight="bold" mb={2}>For iOS (iPhone/iPad):</Text>
								<VStack align="start" spacing={2} pl={4}>
									<Flex align="center">
										<Badge colorScheme="blue" mr={2}>1</Badge>
										<Text>Tap the Share button (📤)</Text>
									</Flex>
									<Flex align="center">
										<Badge colorScheme="blue" mr={2}>2</Badge>
										<Text>Scroll down and tap "Add to Home Screen"</Text>
									</Flex>
									<Flex align="center">
										<Badge colorScheme="blue" mr={2}>3</Badge>
										<Text>Tap "Add" in the top right corner</Text>
									</Flex>
								</VStack>
							</Box>

							<Box p={4} bg={androidBgColor} borderRadius="md">
								<Text fontWeight="bold" mb={2}>For Android:</Text>
								<VStack align="start" spacing={2} pl={4}>
									<Flex align="center">
										<Badge colorScheme="green" mr={2}>1</Badge>
										<Text>Tap the Menu button (⋮ or ⬇️)</Text>
									</Flex>
									<Flex align="center">
										<Badge colorScheme="green" mr={2}>2</Badge>
										<Text>Tap "Install app" or "Add to Home screen"</Text>
									</Flex>
									<Flex align="center">
										<Badge colorScheme="green" mr={2}>3</Badge>
										<Text>Follow the prompts to install</Text>
									</Flex>
								</VStack>
							</Box>

							<Text fontSize="sm" color={textColor}>
								Installing the app will give you faster access, push notifications, and offline capabilities.
							</Text>
						</VStack>
					</ModalBody>

					<ModalFooter>
						<HStack spacing={3}>
							<Button variant="ghost" onClick={onClose}>
								Close
							</Button>
							<Button
								colorScheme="brand"
								onClick={() => {
									onClose();
									// Try to trigger install prompt again
									handleInstallClick();
								}}
								leftIcon={<FiDownload />}
							>
								Try Install Again
							</Button>
						</HStack>
					</ModalFooter>
				</ModalContent>
			</Modal>
		</>
	);
}