'use client';

import {
    Box,
    Heading,
    Text,
    Grid,
    Badge,
    Flex,
    VStack,
    HStack,
    useColorModeValue,
    List,
    ListItem,
    Button,
    Divider,
} from '@chakra-ui/react';
import { AppUser } from '@/lib/sanityTypes';
import Link from 'next/link';

interface DashboardClientProps {
    stockItems: any[];
    purchaseOrders: any[];
    appUsers: AppUser[];
}

export default function DashboardClient({ stockItems, purchaseOrders, appUsers }: DashboardClientProps) {
    const activeUsers = appUsers.filter((user: AppUser) => user.isActive);

    const bgCard = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const borderColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');
    const primaryTextColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const secondaryTextColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');

    return (
        <Box p={{ base: 4, md: 6 }}>
            <Heading as="h1" size={{ base: 'xl', md: '2xl' }} fontWeight="bold" mb={6} color={primaryTextColor}>
                Caterflow Dashboard
            </Heading>

            <Grid
                templateColumns={{
                    base: 'repeat(1, 1fr)',
                    md: 'repeat(2, 1fr)',
                    lg: 'repeat(4, 1fr)'
                }}
                gap={6}
                mb={8}
            >
                <Box bg={bgCard} p={6} rounded="lg" shadow="sm" border="1px" borderColor={borderColor}>
                    <Heading as="h2" size="md" fontWeight="semibold" mb={2} color={secondaryTextColor}>Stock Items</Heading>
                    <Text fontSize="4xl" fontWeight="bold" color={primaryTextColor}>{stockItems.length}</Text>
                </Box>

                <Box bg={bgCard} p={6} rounded="lg" shadow="sm" border="1px" borderColor={borderColor}>
                    <Heading as="h2" size="md" fontWeight="semibold" mb={2} color={secondaryTextColor}>Active Users</Heading>
                    <Text fontSize="4xl" fontWeight="bold" color={primaryTextColor}>{activeUsers.length}</Text>
                </Box>

                <Box bg={bgCard} p={6} rounded="lg" shadow="sm" border="1px" borderColor={borderColor}>
                    <Heading as="h2" size="md" fontWeight="semibold" mb={2} color={secondaryTextColor}>Purchase Orders</Heading>
                    <Text fontSize="4xl" fontWeight="bold" color={primaryTextColor}>{purchaseOrders.length}</Text>
                </Box>

                <Box bg={bgCard} p={6} rounded="lg" shadow="sm" border="1px" borderColor={borderColor}>
                    <Heading as="h2" size="md" fontWeight="semibold" mb={2} color={secondaryTextColor}>Pending Orders</Heading>
                    <Text fontSize="4xl" fontWeight="bold" color={primaryTextColor}>
                        {purchaseOrders.filter((po: any) => po.status === 'ordered').length}
                    </Text>
                </Box>
            </Grid>

            <Grid
                templateColumns={{
                    base: 'repeat(1, 1fr)',
                    lg: 'repeat(2, 1fr)'
                }}
                gap={6}
            >
                <Box bg={bgCard} p={6} rounded="lg" shadow="sm" border="1px" borderColor={borderColor}>
                    <Heading as="h2" size="lg" fontWeight="semibold" mb={4} color={primaryTextColor}>Recent Stock Items</Heading>
                    <List spacing={3}>
                        {stockItems.slice(0, 5).map((item: any) => (
                            <ListItem key={item._id}>
                                <Flex justify="space-between" align="center" py={2} borderBottom="1px" borderColor={borderColor}>
                                    <Text color={primaryTextColor}>{item.name}</Text>
                                    <Text color={secondaryTextColor}>{item.sku}</Text>
                                </Flex>
                            </ListItem>
                        ))}
                    </List>
                    <Link href="/inventory" passHref>
                        <Button variant="link" colorScheme="brand" mt={4}>
                            View All Inventory
                        </Button>
                    </Link>
                </Box>

                <Box bg={bgCard} p={6} rounded="lg" shadow="sm" border="1px" borderColor={borderColor}>
                    <Heading as="h2" size="lg" fontWeight="semibold" mb={4} color={primaryTextColor}>Recent Orders</Heading>
                    <List spacing={3}>
                        {purchaseOrders.slice(0, 5).map((order: any) => (
                            <ListItem key={order._id}>
                                <VStack align="stretch" py={2} borderBottom="1px" borderColor={borderColor}>
                                    <Flex justify="space-between" align="center">
                                        <Text fontWeight="medium" color={primaryTextColor}>{order.poNumber}</Text>
                                        <Badge
                                            colorScheme={
                                                order.status === 'received' ? 'green' :
                                                    order.status === 'ordered' ? 'orange' :
                                                        'gray'
                                            }
                                            variant="subtle"
                                        >
                                            {order.status}
                                        </Badge>
                                    </Flex>
                                    <Text fontSize="sm" color={secondaryTextColor}>
                                        {order.supplier?.name || 'No Supplier'} • {new Date(order.orderDate).toLocaleDateString()}
                                    </Text>
                                </VStack>
                            </ListItem>
                        ))}
                    </List>
                    <Link href="/operations/purchases" passHref>
                        <Button variant="link" colorScheme="brand" mt={4}>
                            View All Orders
                        </Button>
                    </Link>
                </Box>
            </Grid>
        </Box>
    );
}