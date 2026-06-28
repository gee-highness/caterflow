"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  Tooltip,
  Code,
} from "@chakra-ui/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  FiDownload,
  FiPlay,
  FiRefreshCw,
  FiTrash2,
  FiChevronDown,
} from "react-icons/fi";

interface ArchiveStepResult {
  name: string;
  count: number;
  deletedCount: number;
  inserted?: number;
  skipped?: number;
  status: "success" | "partial" | "failed";
  errors: string[];
  warnings: string[];
  assetsDeleted?: number;
  message?: string;
}

interface ArchiveLog {
  _id: string;
  runDate: string;
  status: "success" | "partial" | "failed";
  documentsArchived: number;
  documentsDeleted: number;
  assetsDeleted: number;
  archived?: Record<string, number>;
  totalInserted?: number;
  totalSkipped?: number;
  steps?: ArchiveStepResult[];
  errors?: string[];
  durationMs?: number;
}

export default function ArchiveManagementPage() {
  const { data: session, status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";
  const isAdmin = session?.user?.role === "admin";
  const router = useRouter();
  const toast = useToast();
  const theme = useTheme();

  const [logs, setLogs] = useState<ArchiveLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showRawLog, setShowRawLog] = useState(false);
  const rowsPerPage = 10;
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [deleteOld, setDeleteOld] = useState(false);

  const ARCHIVE_DAYS = Number(process.env.NEXT_PUBLIC_ARCHIVE_DAYS || "90");

  const bgColor = useColorModeValue(
    theme.colors.neutral?.light?.["bg-primary"] || "gray.50",
    theme.colors.neutral?.dark?.["bg-primary"] || "gray.900",
  );
  const headerBg = useColorModeValue(
    "linear-gradient(135deg, #e0e7ff, #cfe2ff)",
    "linear-gradient(135deg, #2a4365, #405c8a)",
  );
  const cardBgColor = useColorModeValue(
    theme.colors.neutral?.light?.["bg-card"] || "white",
    theme.colors.neutral?.dark?.["bg-card"] || "gray.800",
  );
  const textColor = useColorModeValue(
    theme.colors.neutral?.light?.["text-primary"] || "gray.800",
    theme.colors.neutral?.dark?.["text-primary"] || "white",
  );
  const tableHeaderBg = useColorModeValue("gray.100", "gray.700");
  const tableBorderColor = useColorModeValue("gray.200", "gray.600");
  const textColorSecondary = useColorModeValue(
    theme.colors.neutral?.light?.["text-secondary"] || "gray.600",
    theme.colors.neutral?.dark?.["text-secondary"] || "gray.400",
  );

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/archive/status");
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.recentRuns || data.runs || []);
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
    if (sessionStatus === "loading") return;

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
      router.push("/");
    }
  }, [isAuthenticated, isAdmin, router, toast, fetchLogs, sessionStatus]);

  const handleRunArchive = async (options?: { deleteOld?: boolean }) => {
    const confirmationMessage = options?.deleteOld
      ? `Are you sure you want to delete archive run history and baseline snapshots older than ${ARCHIVE_DAYS} days? This action cannot be undone.`
      : "Are you sure you want to trigger a manual archive run? This may take several minutes.";
    if (!confirm(confirmationMessage)) return;

    setIsRunning(true);
    try {
      const query = options?.deleteOld ? "?deleteOld=true" : "";
      const res = await fetch(`/api/archive/run${query}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok) {
        const customMessage =
          data.archiveInProgress || res.status === 409
            ? "Archive already in progress. Please wait for the current run to finish."
            : data.error || "Failed to complete action";
        throw new Error(customMessage);
      }

      if (options?.deleteOld) {
        toast({
          title: "Archive Cleanup Completed",
          description: `Deleted ${data.deletedArchiveRuns || 0} old archive run logs and ${data.deletedBaselineSnapshots || 0} baseline snapshots older than ${ARCHIVE_DAYS} days.`,
          status: "success",
          duration: 5000,
          isClosable: true,
        });
      } else {
        toast({
          title: "Archive Completed",
          description: `Successfully archived ${data.totalArchived || 0} documents.`,
          status: "success",
          duration: 5000,
          isClosable: true,
        });
      }
      fetchLogs();
    } catch (error: any) {
      toast({
        title: options?.deleteOld ? "Archive Cleanup Failed" : "Archive Failed",
        description: error.message,
        status: "error",
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
    window.location.href = "/api/archive/export";
  };

  const selectedRun = selectedRunId
    ? logs.find((log) => log._id === selectedRunId) || null
    : null;

  const handleSelectRun = (runId: string) => {
    setSelectedRunId((current) => (current === runId ? null : runId));
    setShowRawLog(false);
  };

  const handleCopyRawLog = async () => {
    if (!selectedRun) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedRun, null, 2));
      toast({
        title: "Raw log copied",
        description: "The full archive run JSON has been copied to clipboard.",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy raw log to clipboard.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge colorScheme="green">Success</Badge>;
      case "partial":
        return <Badge colorScheme="orange">Partial</Badge>;
      case "failed":
        return <Badge colorScheme="red">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const renderIncomplete = (run: ArchiveLog) => {
    // Highlight incomplete runs if present
    // Some runs include `incomplete: true` in their payload
    // Type may be missing on older entries
    const anyRun: any = run as any;
    if (anyRun.incomplete) {
      return <Badge colorScheme="yellow">Incomplete</Badge>;
    }
    return null;
  };

  if (sessionStatus === "loading") {
    return (
      <Flex justifyContent="center" alignItems="center" height="50vh">
        <Spinner size="xl" />
      </Flex>
    );
  }

  if (!isAdmin) return null;

  return (
    <Box p={{ base: 4, md: 8 }} bg={bgColor} minH="100vh">
      <Flex
        justifyContent="space-between"
        alignItems="center"
        mb={6}
        flexWrap="wrap"
        gap={4}
      >
        <Box>
          <Heading as="h1" size="xl" color={textColor} mb={2}>
            Archive Management
          </Heading>
          <Text color={textColorSecondary}>
            Manage your historical transaction data, run manual archives, and
            download backups.
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
            leftIcon={<FiTrash2 />}
            colorScheme="yellow"
            variant="outline"
            onClick={async () => {
              const secret = window.prompt(
                "Enter admin/cron secret to clear archive lock:",
              );
              if (!secret) return;
              try {
                const res = await fetch("/api/archive/lock/clear", {
                  method: "POST",
                  headers: { "x-admin-secret": `Bearer ${secret}` },
                });
                const body = await res.json();
                if (!res.ok) throw new Error(body.error || "Failed");
                toast({
                  title: "Lock cleared",
                  status: "success",
                  duration: 3000,
                  isClosable: true,
                });
                fetchLogs();
              } catch (err: any) {
                toast({
                  title: "Clear lock failed",
                  description: err?.message || String(err),
                  status: "error",
                  duration: 4000,
                  isClosable: true,
                });
              }
            }}
          >
            Clear Lock
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
            Delete Old Archive Logs
          </Button>
        </HStack>
      </Flex>

      <Card bg={cardBgColor} borderRadius="lg" boxShadow="sm" mb={8}>
        <CardHeader pb={0}>
          <Flex justify="space-between" align="center">
            <Heading as="h2" size="md" color={textColor}>
              Archive Run History
            </Heading>
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
                    <Th color={textColor} isNumeric>
                      Docs Archived
                    </Th>
                    <Th color={textColor} isNumeric>
                      Docs Deleted
                    </Th>
                    <Th color={textColor} isNumeric>
                      <Tooltip
                        label="Prefers run.totalInserted; falls back to summing step.inserted"
                        placement="top"
                      >
                        <Box as="span">Docs Inserted</Box>
                      </Tooltip>
                    </Th>
                    <Th color={textColor} isNumeric>
                      <Tooltip
                        label="Prefers run.totalSkipped; falls back to summing step.skipped"
                        placement="top"
                      >
                        <Box as="span">Docs Skipped</Box>
                      </Tooltip>
                    </Th>
                    <Th color={textColor} isNumeric>
                      Assets Deleted
                    </Th>
                    <Th color={textColor}>Details</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {logs
                    .slice((page - 1) * rowsPerPage, page * rowsPerPage)
                    .map((log) => (
                      <Tr
                        key={log._id}
                        borderBottom="1px solid"
                        borderColor={tableBorderColor}
                        cursor="pointer"
                        onClick={() => handleSelectRun(log._id)}
                      >
                        <Td color={textColorSecondary} whiteSpace="nowrap">
                          {new Date(log.runDate).toLocaleString()}
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            {getStatusBadge(log.status)}
                            {renderIncomplete(log)}
                          </HStack>
                        </Td>
                        <Td color={textColorSecondary} isNumeric>
                          {log.documentsArchived ??
                            (log.steps
                              ? log.steps.reduce(
                                  (s: number, st: any) => s + (st.count || 0),
                                  0,
                                )
                              : Object.values(log.archived || {}).reduce(
                                  (s: number, v: any) => s + (v || 0),
                                  0,
                                ))}
                        </Td>
                        <Td color={textColorSecondary} isNumeric>
                          {log.documentsDeleted ??
                            (log.steps
                              ? log.steps.reduce(
                                  (s: number, st: any) =>
                                    s + (st.deletedCount || 0),
                                  0,
                                )
                              : 0)}
                        </Td>
                        <Td color={textColorSecondary} isNumeric>
                          {log.totalInserted ??
                            (log.steps
                              ? log.steps.reduce(
                                  (s: number, st: any) =>
                                    s + (st.inserted || 0),
                                  0,
                                )
                              : 0)}
                        </Td>
                        <Td color={textColorSecondary} isNumeric>
                          {log.totalSkipped ??
                            (log.steps
                              ? log.steps.reduce(
                                  (s: number, st: any) => s + (st.skipped || 0),
                                  0,
                                )
                              : 0)}
                        </Td>
                        <Td color={textColorSecondary} isNumeric>
                          {log.assetsDeleted}
                        </Td>
                        <Td>
                          <Button
                            size="sm"
                            variant="outline"
                            rightIcon={<FiChevronDown />}
                          >
                            Details
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  {/* Pagination Controls */}
                  {logs.length > rowsPerPage && (
                    <Tr>
                      <Td colSpan={6} textAlign="right">
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
                          onClick={() =>
                            setPage((p) =>
                              p * rowsPerPage < logs.length ? p + 1 : p,
                            )
                          }
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

      {selectedRun && (
        <Card bg={cardBgColor} borderRadius="lg" boxShadow="sm" mb={8}>
          <CardHeader pb={0}>
            <Heading as="h3" size="md" color={textColor}>
              Run details for {new Date(selectedRun.runDate).toLocaleString()}
            </Heading>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={4}>
              <Stat>
                <StatLabel>Documents Archived</StatLabel>
                <StatNumber>{selectedRun.documentsArchived}</StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Documents Deleted</StatLabel>
                <StatNumber>{selectedRun.documentsDeleted}</StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Assets Deleted</StatLabel>
                <StatNumber>{selectedRun.assetsDeleted}</StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Duration</StatLabel>
                <StatNumber>
                  {selectedRun.durationMs
                    ? `${selectedRun.durationMs} ms`
                    : "n/a"}
                </StatNumber>
              </Stat>
            </SimpleGrid>

            {selectedRun.steps?.length ? (
              <Box overflowX="auto" mb={4}>
                <Table variant="simple" size="sm">
                  <Thead bg={tableHeaderBg}>
                    <Tr>
                      <Th>Step</Th>
                      <Th isNumeric>Count</Th>
                      <Th isNumeric>Deleted</Th>
                      <Th isNumeric>Inserted</Th>
                      <Th isNumeric>Skipped</Th>
                      <Th>Status</Th>
                      <Th>Errors</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {selectedRun.steps.map((step) => (
                      <Tr
                        key={step.name}
                        borderBottom="1px solid"
                        borderColor={tableBorderColor}
                      >
                        <Td>{step.name}</Td>
                        <Td isNumeric>{step.count}</Td>
                        <Td isNumeric>{step.deletedCount}</Td>
                        <Td isNumeric>{step.inserted ?? 0}</Td>
                        <Td isNumeric>{step.skipped ?? 0}</Td>
                        <Td>{getStatusBadge(step.status)}</Td>
                        <Td>{step.errors?.length || 0}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            ) : null}

            {selectedRun.steps?.length ? (
              <Box mb={4}>
                <Flex justify="space-between" align="center" mb={3}>
                  <Heading as="h4" size="sm" color={textColor}>
                    Raw run payload
                  </Heading>
                  <HStack spacing={2}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowRawLog((value) => !value)}
                    >
                      {showRawLog ? "Hide raw" : "Show raw"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopyRawLog}
                    >
                      Copy JSON
                    </Button>
                  </HStack>
                </Flex>
                {showRawLog ? (
                  <Box
                    maxH="420px"
                    overflowY="auto"
                    p={3}
                    bg={tableHeaderBg}
                    borderRadius="md"
                  >
                    <Code whiteSpace="pre" width="100%">
                      {JSON.stringify(selectedRun, null, 2)}
                    </Code>
                  </Box>
                ) : null}
              </Box>
            ) : null}

            {selectedRun.errors?.length ? (
              <Alert status="error" borderRadius="md">
                <AlertIcon />
                <Box>
                  <AlertTitle>Archive run errors</AlertTitle>
                  <AlertDescription display="block">
                    {selectedRun.errors.slice(0, 5).map((message, index) => (
                      <Text key={index}>{message}</Text>
                    ))}
                    {selectedRun.errors.length > 5 && (
                      <Text mt={2} fontStyle="italic">
                        And {selectedRun.errors.length - 5} more errors.
                      </Text>
                    )}
                  </AlertDescription>
                </Box>
              </Alert>
            ) : null}
          </CardBody>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Old Archive Logs</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              Are you sure you want to permanently delete archive run history
              and baseline snapshots older than {ARCHIVE_DAYS} days? This
              removes archive metadata only; archived transaction data remains
              preserved.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="red"
              onClick={confirmDeleteOld}
              isLoading={isRunning && deleteOld}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
