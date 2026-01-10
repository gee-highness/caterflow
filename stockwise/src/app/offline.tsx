// app/offline.tsx
'use client';

import { Box, Flex, Heading, Text, Button, Image } from '@chakra-ui/react';
import Link from 'next/link';

export default function Offline() {
  return (
    <Flex
      minH="100vh"
      direction="column"
      align="center"
      justify="center"
      p={8}
      textAlign="center"
    >
      <Box
        bg="white"
        p={3}
        borderRadius="xl"
        boxShadow="md"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Image
          src="/icons/icon-512x512.png"
          alt="Caterflow Logo"
          width={120}
          height={120}
        />
      </Box>
      <Heading as="h1" size="xl" mb={4}>
        You're Offline
      </Heading>
      <Text fontSize="lg" mb={6}>
        It looks like you've lost your connection. Please check your network and try again.
      </Text>
      <Button as={Link} href="/" colorScheme="blue">
        Retry
      </Button>
    </Flex>
  );
}