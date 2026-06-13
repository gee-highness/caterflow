'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Heading,
  Text,
  Flex,
  useToast,
  Spinner,
  useColorModeValue,
  useTheme,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  HStack,
  Card,
  CardHeader,
  CardBody,
  Divider,
  Icon,
  IconButton
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FiDownload, FiPlay, FiRefreshCw } from 'react-icons/fi';

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

  // Theme values
  const bgColor = useColorModeValue(theme.colors.neutral?.light?.['bg-primary'] || 'gray.50', theme.colors.neutral?.dark?.['bg-primary'] || 'gray.900');
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

  const handleRunArchive = async () => {
    if (!confirm('Are you sure you want to trigger a manual archive run? This may take several minutes.')) return;
    
    setIsRunning(true);
    try {
      const res = await fetch('/api/archive/run', {
        method: 'POST',
        // Manual triggers from admin UI can bypass CRON_SECRET if we pass standard auth cookies. 
        // We'll rely on the API verifying admin session. Wait, the API relies on x-cron-secret or admin session.
        headers: {
            'Content-Type': 'application/json'
        }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to run archive');
      
      toast({
        title: "Archive Completed",
        description: `Successfully archived ${data.stats?.documentsArchived || 0} documents.`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });
      fetchLogs();
    } catch (error: any) {
      toast({
        title: "Archive Failed",
        description: error.message,
        status: "error",
        duration: 7000,
        isClosable: true,
      });
    } finally {
      setIsRunning(false);
    }
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
            onClick={handleRunArchive}
            isLoading={isRunning}
            loadingText="Running..."
          >
            Run Archive Now
          </Button>
        </HStack>
      </Flex>

      <Card bg={cardBgColor} borderRadius="lg" boxShadow="sm" mb={8}>
        <CardHeader pb={0}>
          <Flex justify="space-between" align="center">
            <Heading as="h2" size="md" color={textColor}>
              Archive Run History
            </Heading>
            <IconButton
              aria-label="Refresh logs"
              icon={<FiRefreshCw />}
              size="sm"
              variant="ghost"
              onClick={fetchLogs}
              isLoading={isLoading}
            />
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
                  {logs.map((log) => (
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
                </Tbody>
              </Table>
            </Box>
          )}
        </CardBody>
      </Card>
    </Box>
  );
}
