// src/app/not-found.tsx
'use client';

import Link from 'next/link';
import { Box, Flex, Heading, Text, Button, useColorModeValue, useTheme } from '@chakra-ui/react';

export default function NotFound() {
  const theme = useTheme();

  const bgColor = useColorModeValue(theme.colors.neutral.light['bg-primary'], theme.colors.neutral.dark['bg-primary']);
  const textColor = useColorModeValue(theme.colors.neutral.light['text-primary'], theme.colors.neutral.dark['text-primary']);
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
        404 - Page Not Found
      </Heading>
      <Text fontSize="xl" mb={6}>
        Oops! The page you were looking for could not be found.
      </Text>
      <Box mb={8}>
        <Text fontSize="md">
          This could be due to a broken link or the page being removed. Please check the URL and try again.
        </Text>
      </Box>
      <Link href="/" passHref>
        <Button colorScheme={buttonScheme} size="lg">
          Return to Dashboard
        </Button>
      </Link>
    </Flex>
  );
}