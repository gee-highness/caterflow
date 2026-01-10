// src/components/OptimisticLoading.tsx
import { Spinner, Box, Text } from '@chakra-ui/react';

interface OptimisticLoadingProps {
    message?: string;
}

export const OptimisticLoading = ({ message = "Saving changes..." }: OptimisticLoadingProps) => {
    return (
        <Box
            position="fixed"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            bg="rgba(255, 255, 255, 0.9)"
            p={4}
            borderRadius="md"
            boxShadow="lg"
            zIndex={9999}
        >
            <Spinner size="lg" color="blue.500" />
            <Text mt={2} fontSize="sm" color="gray.600">
                {message}
            </Text>
        </Box>
    );
};