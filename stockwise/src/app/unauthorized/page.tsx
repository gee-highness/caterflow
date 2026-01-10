// src/app/unauthorized/page.tsx
'use client';

import Link from 'next/link';
import { Box, Flex, Heading, Text, Button, useColorModeValue, useTheme } from '@chakra-ui/react'; // Import useTheme

export default function UnauthorizedPage() {
  const theme = useTheme(); // Initialize useTheme

  const bgColor = useColorModeValue(theme.colors.neutral.light['bg-primary'], theme.colors.neutral.dark['bg-primary']); // Themed background
  const textColor = useColorModeValue(theme.colors.neutral.light['text-primary'], theme.colors.neutral.dark['text-primary']); // Themed text color
  const buttonScheme = 'brand';

  return (
    <Flex
      minH="100vh"
      direction="column"
      align="center"
      justify="center"
      bg={bgColor}
      color={textColor}
      textAlign="center"
      p={8}
    >
      <Heading as="h1" size="2xl" mt={8} mb={4}>
        Access Denied
      </Heading>
      <Text fontSize="xl" mb={6}>
        You do not have permission to view this page.
      </Text>
      <Box mb={8}>
        <Text fontSize="md">
          Please log in with an account that has the necessary privileges.
        </Text>
      </Box>
      <Link href="/login" passHref>
        <Button colorScheme={buttonScheme} size="lg">
          Go to Login
        </Button>
      </Link>
    </Flex>
  );
}
