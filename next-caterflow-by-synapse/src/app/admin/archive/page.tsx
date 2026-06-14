"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Heading,
  Text,
  Button,
  VStack,
  HStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  useToast,
  useColorModeValue,
  Flex,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Checkbox,
  Card,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  useTheme,
  Icon,
  IconButton,
  CardHeader,
  Tooltip
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FiDownload, FiPlay, FiRefreshCw, FiTrash2 } from 'react-icons/fi';

interface ArchiveLog {
  _id: string;
  runDate: string;
  status: 'success' | 'partial' | 'failed';
  documentsArchived: number;
  documentsDeleted: number;
  assetsDeleted: number;
  errors: string[];
}

export default function ArchiveManagementPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';
  const isAdmin = session?.user?.role === 'admin';
  const router = useRouter();
  const toast = useToast();
  const theme = useTheme();

  const [logs, setLogs] = useState<ArchiveLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [deleteOld, setDeleteOld] = useState(false);

  const ARCHIVE_DAYS = Number(process.env.NEXT_PUBLIC_ARCHIVE_DAYS || '90');

  const bgColor = useColorModeValue(theme.colors.neutral?.light?.['bg-primary'] || 'gray.50', theme.colors.neutral?.dark?.['bg-primary'] || 'gray.900');
  const headerBg = useColorModeValue('linear-gradient(135deg, #e0e7ff, #cfe2ff)', 'linear-gradient(135deg, #2a4365, #405c8a)');
  const cardBgColor = useColorModeValue(theme.colors.neutral?.light?.['bg-card'] || 'white', theme.colors.neutral?.dark?.['bg-card'] || 'gray.800');
  const textColor = useColorModeValue(theme.colors.neutral?.light?.['text-primary'] || 'gray.800', theme.colors.neutral?.dark?.['text-primary'] || 'white');
  const tableHeaderBg = useColorModeValue('gray.100', 'gray.700');
  const tableBorderColor = useColorModeValue('gray.200', 'gray.600');
  const textColorSecondary = useColorModeValue(theme.colors.neutral?.light?.['text-secondary'] || 'gray.600', theme.colors.neutral?.dark?.['text-secondary'] || 'gray.400');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/archive/status');
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogs(data.recentRuns || []);
    } catch (error) {
      console.error("Failed to fetch archive logs:", error);
      toast({
        title: "Error",
        description: "Failed to load archive history.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (isAuthenticated && isAdmin) {
      fetchLogs();
    } else if (isAuthenticated && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "You do not have permission to view this page.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      router.push('/');
    }
  }, [isAuthenticated, isAdmin, router, toast, fetchLogs, sessionStatus]);

  const handleRunArchive = async (options?: { deleteOld?: boolean }) => {
    if (!confirm('Are you sure you want to trigger a manual archive run? This may take several minutes.')) return;
    setIsRunning(true);
    try {
      const query = options?.deleteOld ? '?deleteOld=true' : '';
      const res = await fetch(`/api/archive/run${query}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run archive');

      toast({
        title: 'Archive Completed',
        description: `Successfully archived ${data.stats?.documentsArchived || 0} documents${options?.deleteOld ? ' and deleted old data' : ''}.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      fetchLogs();
    } catch (error: any) {
      toast({
        title: 'Archive Failed',
        description: error.message,
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
    } finally {
      setIsRunning(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteOld(true);
    onOpen();
  };

  const confirmDeleteOld = async () => {
    await handleRunArchive({ deleteOld: true });
    onClose();
    setDeleteOld(false);
  };

  const handleDownloadBackup = () => {
    // Just navigate to the endpoint to trigger the browser download
    window.location.href = '/api/archive/export';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <Badge colorScheme="green">Success</Badge>;
      case 'partial': return <Badge colorScheme="orange">Partial</Badge>;
      case 'failed': return <Badge colorScheme="red">Failed</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <Flex justifyContent="center" alignItems="center" height="50vh">
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (!isAdmin) return null;

  return (
    <Box p={{ base: 4, md: 8 }} bg={bgColor} minH="100vh">
      <Flex justifyContent="space-between" alignItems="center" mb={6} flexWrap="wrap" gap={4}>
        <Box>
          <Heading as="h1" size="xl" color={textColor} mb={2}>
            Archive Management
          </Heading>
          <Text color={textColorSecondary}>
            Manage your historical transaction data, run manual archives, and download backups.
          </Text>
        </Box>
        <HStack spacing={4}>
          <Button 
            leftIcon={<FiDownload />} 
            colorScheme="gray" 
            variant="outline"
            onClick={handleDownloadBackup}
          >
            Download Backup
          </Button>
          <Button
            leftIcon={<FiPlay />}
            colorScheme="brand"
            onClick={() => handleRunArchive()}
            isLoading={isRunning}
            loadingText="Running..."
          >
            Run Archive Now
          </Button>
          <Button
            leftIcon={<FiTrash2 />}
            colorScheme="red"
            onClick={openDeleteModal}
            isLoading={isRunning && deleteOld}
            loadingText="Deleting..."
          >
            Delete Old Data
          </Button>
        </HStack>
      </Flex>

      <Card bg={cardBgColor} borderRadius="lg" boxShadow="sm" mb={8}>
        <CardHeader pb={0}>
          <Flex justify="space-between" align="center">
            <Heading as="h2" size="md" color={textColor}>Archive Run History</Heading>
            <HStack>
              <Tooltip label="Refresh archive logs" placement="top">
                <IconButton
                  aria-label="Refresh logs"
                  icon={<FiRefreshCw />}
                  size="sm"
                  variant="ghost"
                  onClick={fetchLogs}
                  isLoading={isLoading}
                />
              </Tooltip>
            </HStack>
          </Flex>
        </CardHeader>
                <CardBody>
          {isLoading && logs.length === 0 ? (
            <Flex justify="center" p={8}>
              <Spinner />
            </Flex>
          ) : logs.length === 0 ? (
            <Text color={textColorSecondary} textAlign="center" p={8}>
              No archive history found.
            </Text>
          ) : (
            <Box overflowX="auto">
              <Table variant="simple" size="md">
                <Thead bg={tableHeaderBg}>
                  <Tr>
                    <Th color={textColor}>Date</Th>
                    <Th color={textColor}>Status</Th>
                    <Th color={textColor} isNumeric>Docs Archived</Th>
                    <Th color={textColor} isNumeric>Docs Deleted</Th>
                    <Th color={textColor} isNumeric>Assets Deleted</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {logs.slice((page - 1) * rowsPerPage, page * rowsPerPage).map((log) => (
                    <Tr key={log._id} borderBottom="1px solid" borderColor={tableBorderColor}>
                      <Td color={textColorSecondary} whiteSpace="nowrap">
                        {new Date(log.runDate).toLocaleString()}
                      </Td>
                      <Td>{getStatusBadge(log.status)}</Td>
                      <Td color={textColorSecondary} isNumeric>{log.documentsArchived}</Td>
                      <Td color={textColorSecondary} isNumeric>{log.documentsDeleted}</Td>
                      <Td color={textColorSecondary} isNumeric>{log.assetsDeleted}</Td>
                    </Tr>
                  ))}
                  {/* Pagination Controls */}
                  {logs.length > rowsPerPage && (
                    <Tr>
                      <Td colSpan={5} textAlign="right">
                        <Button
                          size="sm"
                          onClick={() => setPage((p) => Math.max(p - 1, 1))}
                          disabled={page === 1}
                          mr={2}
                        >
                          Prev
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setPage((p) => (p * rowsPerPage < logs.length ? p + 1 : p))}
                          disabled={page * rowsPerPage >= logs.length}
                        >
                          Next
                        </Button>
                      </Td>
                    </Tr>
                  )}
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Archived Data</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              Are you sure you want to permanently delete all archived records older than {ARCHIVE_DAYS} days from Sanity? This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={confirmDeleteOld} isLoading={isRunning && deleteOld}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}