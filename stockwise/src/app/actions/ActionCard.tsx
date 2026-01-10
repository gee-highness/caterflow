// src/components/ActionCard.tsx
import {
    Card,
    CardBody,
    Text,
    Badge,
    Flex,
    Spacer,
    Heading,
    Icon,
    useColorModeValue,
    Box,
    Button,
    VStack,
} from '@chakra-ui/react';
import { BsArrowRight } from 'react-icons/bs';
import Link from 'next/link';

interface ActionCardProps {
    title: string;
    description: string;
    count: number;
    type: 'pending' | 'draft' | 'lowStock' | 'outOfStock' | 'alert';
    link: string;
}

export const ActionCard = ({ title, description, count, type, link }: ActionCardProps) => {
    const cardBg = useColorModeValue('neutral.light.bg-card', 'neutral.dark.bg-card');
    const textColor = useColorModeValue('neutral.light.text-primary', 'neutral.dark.text-primary');
    const descriptionColor = useColorModeValue('neutral.light.text-secondary', 'neutral.dark.text-secondary');
    const dividerColor = useColorModeValue('neutral.light.border-color', 'neutral.dark.border-color');

    const getBadgeColorScheme = (cardType: ActionCardProps['type']) => {
        switch (cardType) {
            case 'pending':
                return 'orange';
            case 'draft':
                return 'blue';
            case 'lowStock':
                return 'yellow';
            case 'outOfStock':
                return 'red';
            case 'alert':
                return 'red';
            default:
                return 'gray';
        }
    };

    return (
        <Card
            boxShadow="md"
            bg={cardBg}
            sx={{
                _dark: {
                    boxShadow: 'dark-md',
                },
            }}
            size={{ base: 'sm', md: 'md' }}
            height="100%"
        >
            <CardBody>
                <VStack align="flex-start" spacing={3} h="full">
                    <Flex align="center" width="full">
                        <Heading size={{ base: 'sm', md: 'md' }} color={textColor} noOfLines={1}>
                            {title}
                        </Heading>
                        <Spacer />
                        {count > 0 && (
                            <Badge colorScheme={getBadgeColorScheme(type)} variant="solid" borderRadius="full" px={2}>
                                {count}
                            </Badge>
                        )}
                    </Flex>

                    <Text fontSize={{ base: 'sm', md: 'md' }} color={descriptionColor} noOfLines={2} flex="1">
                        {description}
                    </Text>

                    <Box width="full" pt={2} borderTop="1px solid" borderColor={dividerColor}>
                        <Link href={link} passHref>
                            <Button
                                as="a"
                                variant="ghost"
                                colorScheme="brand"
                                size="sm"
                                width="full"
                                justifyContent="space-between"
                                rightIcon={<Icon as={BsArrowRight} />}
                            >
                                View Details
                            </Button>
                        </Link>
                    </Box>
                </VStack>
            </CardBody>
        </Card>
    );
};