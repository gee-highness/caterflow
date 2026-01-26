'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Heading,
    Text,
    Flex,
    Spinner,
    Card,
    CardBody,
    VStack,
    HStack,
    Badge,
    Button,
    useToast,
    Tabs,
    TabList,
    TabPanels,
    Tab,
    TabPanel,
    Icon,
    useColorModeValue,
} from '@chakra-ui/react';
import { useSession } from 'next-auth/react'; // Keep this import
import { FiBox, FiTruck, FiRefreshCw, FiBarChart2, FiCalendar, FiClock } from 'react-icons/fi';
import { BsBuildingAdd, BsTruck, BsArrowRight, BsBoxSeam, BsClipboardData } from 'react-icons/bs';

interface ActivityItem {
    _id: string;
    _type: string;
    description: string;
    user: string;
    timestamp: string;
    siteName: string;
}

export default function ActivityPage() {
    // Replace this:
    // const { user, isAuthReady } = useSession();

    // With this:
    const { data: session, status } = useSession();
    const isAuthReady = status !== 'loading';

    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('week');
    const toast = useToast();

    const cardBg = useColorModeValue('white', 'gray.700');
    const borderColor = useColorModeValue('gray.200', 'gray.600');

    const fetchActivities = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/activity?timeframe=${timeframe}`);
            if (!response.ok) throw new Error('Failed to fetch activities');
            const data = await response.json();
            setActivities(data);
        } catch (error) {
            console.error("Failed to fetch activities:", error);
            toast({
                title: 'Error',
                description: 'Failed to load activities',
                status: 'error',
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast, timeframe]);

    useEffect(() => {
        if (status === 'loading') return; // Wait for auth to be ready
        fetchActivities();
    }, [status, timeframe, fetchActivities]); // Use status instead of isAuthReady

    // Update the getActivityIcon function to include InventoryCount
    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'GoodsReceipt':
                return BsBuildingAdd;
            case 'DispatchLog':
                return BsTruck;
            case 'InternalTransfer':
                return BsArrowRight;
            case 'StockAdjustment':
                return BsBoxSeam;
            case 'InventoryCount':
                return BsClipboardData;
            default:
                return BsBoxSeam;
        }
    };

    // Update the getActivityColor function
    const getActivityColor = (type: string) => {
        switch (type) {
            case 'GoodsReceipt':
                return 'green';
            case 'DispatchLog':
                return 'orange';
            case 'InternalTransfer':
                return 'blue';
            case 'StockAdjustment':
                return 'purple';
            case 'InventoryCount':
                return 'teal';
            default:
                return 'gray';
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else if (diffDays === 1) {
            return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString();
        }
    };

    // Update the loading check to use status
    if (status === 'loading') {
        return (
            <Flex justify="center" align="center" height="100vh">
                <Spinner size="xl" />
            </Flex>
        );
    }

    const ActivityIcon = ({ type }: { type: string }) => {
        switch (type) {
            case 'GoodsReceipt':
                return <Icon as={BsBuildingAdd} color="green.500" boxSize={4} />;
            case 'DispatchLog':
                return <Icon as={BsTruck} color="orange.500" boxSize={4} />;
            case 'InternalTransfer':
                return <Icon as={BsArrowRight} color="blue.500" boxSize={4} />;
            case 'StockAdjustment':
                return <Icon as={BsBoxSeam} color="purple.500" boxSize={4} />;
            case 'InventoryCount':
                return <Icon as={BsClipboardData} color="teal.500" boxSize={4} />;
            default:
                return null;
        }
    };

    return (
        <Box p={8}>
            <Heading as="h1" size="xl" mb={6}>
                Activity Log
            </Heading>

            <Tabs variant="enclosed" mb={6} onChange={(index) => setTimeframe(index === 0 ? 'today' : index === 1 ? 'week' : 'month')}>
                <TabList>
                    <Tab>
                        <Icon as={FiClock} mr={2} />
                        Today
                    </Tab>
                    <Tab>
                        <Icon as={FiCalendar} mr={2} />
                        This Week
                    </Tab>
                    <Tab>
                        <Icon as={FiCalendar} mr={2} />
                        This Month
                    </Tab>
                </TabList>
                <TabPanels>
                    <TabPanel p={0} pt={4}>
                        <Text color="gray.500" mb={4}>Showing activities from today</Text>
                    </TabPanel>
                    <TabPanel p={0} pt={4}>
                        <Text color="gray.500" mb={4}>Showing activities from the past week</Text>
                    </TabPanel>
                    <TabPanel p={0} pt={4}>
                        <Text color="gray.500" mb={4}>Showing activities from the past month</Text>
                    </TabPanel>
                </TabPanels>
            </Tabs>

            <Button
                onClick={fetchActivities}
                leftIcon={<FiRefreshCw />}
                mb={6}
                isLoading={isLoading}
                loadingText="Refreshing"
            >
                Refresh Activities
            </Button>

            {isLoading ? (
                <Flex justifyContent="center" alignItems="center" minHeight="150px">
                    {/* Using the spinnerColor variable */}
                    <Spinner size="lg" />
                </Flex>
            ) : activities.length > 0 ? (
                <VStack spacing={3} align="stretch">
                    {activities.map(activity => (
                        <Card key={activity._id} boxShadow="sm" size="sm" borderLeft="4px" borderLeftColor={`${getActivityColor(activity._type)}.400`}>
                            <CardBody py={3} px={4}>
                                <Flex direction={{ base: 'column', sm: 'row' }} alignItems={{ base: 'flex-start', sm: 'center' }}>
                                    <Box flexShrink={0} mb={{ base: 2, sm: 0 }}>
                                        <ActivityIcon type={activity._type} />
                                    </Box>
                                    <Box flex="1" ml={{ base: 0, sm: 3 }}>
                                        <Text fontWeight="medium" fontSize="sm" noOfLines={2}>
                                            {activity.description}
                                        </Text>
                                        <Flex direction={{ base: 'column', sm: 'row' }} fontSize="xs" mt={1} color="gray.500">
                                            <Text>By {activity.user}</Text>
                                            <Text display={{ base: 'none', sm: 'block' }} mx={2}>•</Text>
                                            <Text>{formatDate(activity.timestamp)}</Text>
                                            <Text display={{ base: 'none', sm: 'block' }} mx={2}>•</Text>
                                            <Text noOfLines={1}>{activity.siteName}</Text>
                                        </Flex>
                                    </Box>
                                    <Badge
                                        colorScheme={getActivityColor(activity._type)}
                                        ml={{ base: 0, sm: 3 }}
                                        mt={{ base: 2, sm: 0 }}
                                        flexShrink={0}
                                    >
                                        {activity._type.replace(/([A-Z])/g, ' $1').trim()}
                                    </Badge>
                                </Flex>
                            </CardBody>
                        </Card>
                    ))}
                </VStack>
            ) : (
                <Box textAlign="center" py={6}>
                    <Text fontSize="sm">
                        No history found."
                    </Text>
                </Box>
            )}
        </Box>
    );
}