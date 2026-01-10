// src/components/Footer.tsx
'use client';

import React from 'react';
import {
  Box,
  Text,
  Container,
  useColorModeValue,
  useTheme,
  Flex,
  Link,
  Divider,
} from '@chakra-ui/react';

interface FooterProps {
  appName?: string;
}

export function Footer({ appName = 'Caterflow' }: FooterProps) {
  const theme = useTheme();

  const footerBg = useColorModeValue(theme.colors.neutral.light['bg-secondary'], theme.colors.neutral.dark['bg']);
  const footerText = useColorModeValue(theme.colors.neutral.light['text-secondary'], theme.colors.neutral.dark['text-secondary']);

  return (
    <Box as="footer" bg={footerBg} color={footerText} p={6} textAlign="center" mt="auto">
      <Divider />
      <br />
      <Container maxW="container.xl">
        <Flex direction={{ base: 'column', md: 'row' }} justify="space-between" align="center">
          <Text>
            &copy; {new Date().getFullYear()} {appName} by{' '}
            <Link href="https://synapse-digital.vercel.app" isExternal>
              Synapse Digital
            </Link>
            . All rights reserved.
          </Text>
          <Flex mt={{ base: 4, md: 0 }} gap={4}>
            <Link href="/privacy" fontSize="sm">
              Privacy Policy
            </Link>
            <Link href="/terms" fontSize="sm">
              Terms of Service
            </Link>
            <Link href="https://caterflow-docs.vercel.app/" fontSize="sm" isExternal>
              Support
            </Link>
          </Flex>
        </Flex>
      </Container>
    </Box>
  );
}