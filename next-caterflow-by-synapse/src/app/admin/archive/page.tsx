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
  Progress,
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

interface ArchiveCurrentRun {
  runId: string;
  status: "running" | "failed" | "success" | "incomplete";
  startedAt: string;
  currentStep: string | null;
  currentStepIndex: number;
  totalSteps: number;
  completedSteps: string[];
  pendingSteps: string[];
  errors: string[];
  progressPercent: number;
  lastUpdatedAt: string;
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
  const [archiveInProgress, setArchiveInProgress] = useState(false);
  const [currentRun, setCurrentRun] = useState<ArchiveCurrentRun | null>(null);
  const [previousArchiveInProgress, setPreviousArchiveInProgress] =
    useState(false);
  const [page, setPage] = useState(1);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showRawLog, setShowRawLog] = useState(false);
  const rowsPerPage = 10;
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isRunModalOpen,
    onOpen: onRunModalOpen,
    onClose: onRunModalClose,
  } = useDisclosure();
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
      setArchiveInProgress(data.archiveInProgress === true);
      setCurrentRun(data.currentRun || null);
    } catch (error) {
      console.error("Failed to fetch archive logs:", error);
      toast({
        title: "Error",
        description: "Failed to load archive history.",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      setArchiveInProgress(false);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAuthenticated || !isAdmin || !archiveInProgress) return;

    const intervalId = window.setInterval(fetchLogs, 15000);
    return () => window.clearInterval(intervalId);
  }, [archiveInProgress, fetchLogs, isAuthenticated, isAdmin]);

  useEffect(() => {
    if (previousArchiveInProgress && !archiveInProgress) {
      const latestRun = logs[0];
      if (latestRun) {
        const runStatus = latestRun.status || "success";
        toast({
          title:
            runStatus === "success"
              ? "Archive Complete"
              : runStatus === "failed"
                ? "Archive Failed"
                : "Archive Finished",
          description:
            runStatus === "success"
              ? `Archive completed successfully. ${latestRun.documentsArchived} documents archived.`
              : runStatus === "failed"
                ? `Archive failed. Check run details for errors.`
                : `Archive finished with status: ${runStatus}.`,
          status: runStatus === "success" ? "success" : "error",
          duration: 8000,
          isClosable: true,
        });
      }

      const refreshTimer = window.setTimeout(fetchLogs, 2000);
      return () => window.clearTimeout(refreshTimer);
    }

    setPreviousArchiveInProgress(archiveInProgress);
  }, [archiveInProgress, previousArchiveInProgress, logs, toast, fetchLogs]);

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
    if (options?.deleteOld) {
      const confirmationMessage = `Are you sure you want to delete archive run history and baseline snapshots older than ${ARCHIVE_DAYS} days? This action cannot be undone.`;
      if (!confirm(confirmationMessage)) return;
    }

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

      // If server accepted the request and started the archive in background
      if (res.status === 202 || data.started) {
        toast({
          title: "Archive Started",
          description:
            "Archive is running in the background. Check run history for progress.",
          status: "info",
          duration: 5000,
          isClosable: true,
        });
        // Refresh logs/status once immediately and let the periodic fetch update later
        fetchLogs();
      } else if (options?.deleteOld) {
        toast({
          title: "Archive Cleanup Completed",
          description: `Deleted ${data.deletedSanityDocuments || 0} old Sanity documents already backed up to Mongo and cleaned up ${data.deletedArchiveRuns || 0} archive run records older than ${ARCHIVE_DAYS} days.`,
          status: "success",
          duration: 5000,
          isClosable: true,
        });
      } else {
        const lockClearedMessage = data.lockCleared
          ? "A stale archive lock was found and cleared automatically. "
          : "";

        toast({
          title: "Archive Completed",
          description: `${lockClearedMessage}Successfully archived ${data.totalArchived || 0} documents.`,
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
    setSelectedRunId(runId);
    setShowRawLog(false);
    onRunModalOpen();
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
            leftIcon={<FiPlay />}
            colorScheme="brand"
            onClick={() => handleRunArchive()}
            isLoading={isRunning}
            isDisabled={archiveInProgress || isRunning}
            loadingText="Running..."
          >
            {archiveInProgress ? "Archive Running" : "Run Archive Now"}
          </Button>
          <Button
            leftIcon={<FiTrash2 />}
            colorScheme="red"
            onClick={openDeleteModal}
            isLoading={isRunning && deleteOld}
            loadingText="Deleting..."
          >
            Delete Old Archived Sanity Data
          </Button>
        </HStack>
      </Flex>

      {currentRun ? (
        <Card bg={cardBgColor} borderRadius="lg" boxShadow="sm" mb={8}>
          <CardHeader pb={0}>
            <Flex justify="space-between" align="center">
              <Box>
                <Heading as="h2" size="md" color={textColor}>
                  Current Archive Status
                </Heading>
                <Text color={textColorSecondary} fontSize="sm">
                  Run ID: {currentRun.runId}
                </Text>
              </Box>
              <Badge
                colorScheme={
                  currentRun.status === "running"
                    ? "blue"
                    : currentRun.status === "success"
                      ? "green"
                      : currentRun.status === "failed"
                        ? "red"
                        : "yellow"
                }
              >
                {currentRun.status.toUpperCase()}
              </Badge>
            </Flex>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={4}>
              <Stat>
                <StatLabel>Started</StatLabel>
                <StatNumber>
                  {new Date(currentRun.startedAt).toLocaleString()}
                </StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Step</StatLabel>
                <StatNumber>
                  {currentRun.currentStep || "Starting..."}
                </StatNumber>
                <StatHelpText>
                  {currentRun.currentStepIndex}/{currentRun.totalSteps}
                </StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>Progress</StatLabel>
                <StatNumber>{currentRun.progressPercent}%</StatNumber>
              </Stat>
              <Stat>
                <StatLabel>Last updated</StatLabel>
                <StatNumber>
                  {new Date(currentRun.lastUpdatedAt).toLocaleString()}
                </StatNumber>
              </Stat>
            </SimpleGrid>
            <Progress
              value={currentRun.progressPercent}
              size="sm"
              colorScheme={currentRun.status === "failed" ? "red" : "blue"}
              mb={4}
            />
            <HStack spacing={3} wrap="wrap">
              <Badge colorScheme="green">
                Completed: {currentRun.completedSteps.length}
              </Badge>
              <Badge colorScheme="yellow">
                Pending: {currentRun.pendingSteps.length}
              </Badge>
              {currentRun.errors.length > 0 && (
                <Badge colorScheme="red">
                  Errors: {currentRun.errors.length}
                </Badge>
              )}
            </HStack>
          </CardBody>
        </Card>
      ) : null}

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
                            onClick={() => handleSelectRun(log._id)}
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

      <Modal
        isOpen={isRunModalOpen}
        onClose={onRunModalClose}
        size="xl"
        scrollBehavior="inside"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Archive Run Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedRun ? (
              <Box>
                <Text mb={4} color={textColorSecondary}>
                  {new Date(selectedRun.runDate).toLocaleString()}
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
                  <Stat>
                    <StatLabel>Status</StatLabel>
                    <StatNumber>{selectedRun.status}</StatNumber>
                  </Stat>
                  <Stat>
                    <StatLabel>Documents Archived</StatLabel>
                    <StatNumber>{selectedRun.documentsArchived}</StatNumber>
                  </Stat>
                  <Stat>
                    <StatLabel>Documents Deleted</StatLabel>
                    <StatNumber>{selectedRun.documentsDeleted}</StatNumber>
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
                          <Tr key={step.name}>
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
                {selectedRun.errors?.length ? (
                  <Alert status="error" borderRadius="md">
                    <AlertIcon />
                    <Box>
                      <AlertTitle>Archive run errors</AlertTitle>
                      <AlertDescription display="block">
                        {selectedRun.errors
                          .slice(0, 5)
                          .map((message, index) => (
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
              </Box>
            ) : (
              <Text>No run selected.</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onRunModalClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Old Archived Sanity Data</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              This will delete Sanity documents that were already backed up to
              MongoDB and are older than {ARCHIVE_DAYS} days. It will also clean
              up old archive metadata records. This action cannot be undone.
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
