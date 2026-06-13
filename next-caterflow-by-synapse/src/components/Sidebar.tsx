"use client";

import React, { useState } from "react";
import {
  Box,
  Flex,
  Heading,
  Button,
  Stack,
  useColorMode,
  useColorModeValue,
  IconButton,
  Link as ChakraLink,
  Text,
  useTheme,
  Tooltip,
  Icon,
  Divider,
  Spinner,
  Collapse,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  useBreakpointValue,
} from "@chakra-ui/react";
import { MoonIcon, SunIcon, HamburgerIcon } from "@chakra-ui/icons";
import NextLink from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  FiLogOut,
  FiBarChart2,
  FiBox,
  FiMapPin,
  FiTruck,
  FiUsers,
  FiSettings,
  FiBell,
  FiClock,
  FiActivity,
  FiChevronDown,
  FiChevronUp,
  FiUser,
  FiLayers,
  FiDatabase,
  FiShoppingCart,
  FiFileText,
  FiClipboard,
  FiRepeat,
  FiShoppingBag,
  FiAlertTriangle,
  FiPackage,
  FiList,
  FiCheckCircle,
  FiHome,
  FiTrendingUp,
  FiAlertCircle,
  FiBriefcase,
} from "react-icons/fi";
import { useSession, signOut } from "next-auth/react";
import { useLoading } from "@/context/LoadingContext";
import { useSidebar } from "@/context/SidebarContext";

interface SidebarProps {
  appName?: string;
}

// Extract the sidebar content into a separate component
const SidebarContent = ({ onItemClick }: { onItemClick?: () => void }) => {
  const { colorMode, toggleColorMode } = useColorMode();
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([
    "Overview",
    "Inventory",
    "Operations",
    "Administration",
  ]);
  const { setLoading } = useLoading();

  // Theme-aware colors
  const sidebarBg = useColorModeValue(
    theme.colors.neutral.light["bg-secondary"],
    theme.colors.neutral.dark["bg-secondary"],
  );
  const activeBg = useColorModeValue(
    theme.colors.brand["100"],
    theme.colors.brand["700"],
  );
  const borderColor = useColorModeValue(
    theme.colors.neutral.light["border-color"],
    theme.colors.neutral.dark["border-color"],
  );
  const iconColor = useColorModeValue(
    "neutral.light.text-primary",
    "neutral.dark.text-primary",
  );
  const textSecondaryColor = useColorModeValue(
    "neutral.light.text-secondary",
    "neutral.dark.text-secondary",
  );
  const hoverBg = useColorModeValue("gray.100", "gray.700");

  // Define menu items with roles and groups - Improved icons for better distinction
  const menuGroups = [
    {
      heading: "Overview",
      icon: FiHome,
      items: [
        {
          label: "Dashboard",
          href: "/",
          icon: FiBarChart2,
          roles: [
            "admin",
            "siteManager",
            "stockController",
            "auditor",
            "procurer",
          ],
        },
        {
          label: "Activity",
          href: "/activity",
          icon: FiActivity,
          roles: ["admin", "siteManager", "stockController", "auditor"],
        },
        {
          label: "Actions",
          href: "/actions",
          icon: FiAlertTriangle,
          roles: ["admin", "siteManager", "stockController", "procurer"],
        },
      ],
    },
    {
      heading: "Inventory",
      icon: FiPackage,
      items: [
        {
          label: "Current Stock",
          href: "/current",
          icon: FiDatabase,
          roles: [
            "admin",
            "siteManager",
            "stockController",
            "auditor",
            "procurer",
          ],
        },
        {
          label: "Stock Items",
          href: "/stock-items",
          icon: FiList,
          roles: ["admin", "siteManager", "stockController", "procurer"],
        },
        {
          label: "Low Stock",
          href: "/low-stock",
          icon: FiAlertCircle,
          roles: [
            "admin",
            "siteManager",
            "stockController",
            "auditor",
            "procurer",
          ],
        },
      ],
    },
    {
      heading: "Operations",
      icon: FiSettings,
      items: [
        {
          label: "Approvals",
          href: "/approvals",
          icon: FiCheckCircle,
          roles: ["admin", "siteManager"],
        },
        {
          label: "Purchases",
          href: "/operations/purchases",
          icon: FiShoppingCart,
          roles: ["admin", "siteManager", "stockController", "auditor"],
        },
        {
          label: "Receipts",
          href: "/operations/receipts",
          icon: FiFileText,
          roles: ["admin", "siteManager", "stockController", "auditor"],
        },
        {
          label: "Dispatches",
          href: "/operations/dispatches",
          icon: FiTruck,
          roles: ["admin", "siteManager", "stockController", "auditor"],
        },
        {
          label: "Counts",
          href: "/operations/bin-counts",
          icon: FiClipboard,
          roles: ["admin", "siteManager", "stockController", "auditor"],
        },
        {
          label: "Transfers",
          href: "/operations/transfers",
          icon: FiRepeat,
          roles: [
            "admin",
            "siteManager",
            "stockController",
            "auditor",
            "procurer",
          ],
        },
        {
          label: "Procurement",
          href: "/operations/procurement",
          icon: FiShoppingBag,
          roles: ["admin", "procurer"],
        },
      ],
    },
    {
      heading: "Administration",
      icon: FiUsers,
      items: [
        { label: "Users", href: "/users", icon: FiUsers, roles: ["admin"] },
        {
          label: "Dispatch Types",
          href: "/dispatch-types",
          icon: FiTruck,
          roles: ["admin"],
        },
        {
          label: "Archive",
          href: "/admin/archive",
          icon: FiDatabase,
          roles: ["admin"],
        },
        {
          label: "Locations",
          href: "/locations",
          icon: FiMapPin,
          roles: ["admin"],
        },
        {
          label: "Suppliers",
          href: "/suppliers",
          icon: FiBriefcase,
          roles: ["admin", "procurer"],
        },
        {
          label: "Reports",
          href: "/reports",
          icon: FiClipboard,
          roles: ["admin", "siteManager", "auditor"],
        },

        //{ label: 'Notifications', href: '/notifications', icon: FiBell, roles: ['admin'] },
        //{ label: 'System Settings', href: '/settings', icon: FiSettings, roles: ['admin'] },
      ],
    },
  ];

  // Get user role from session
  const userRole = session?.user?.role;
  const isAuthenticated = status === "authenticated";
  const isAuthReady = status !== "loading";

  // Filter menu items based on the user's role
  const filteredMenuGroups = userRole
    ? menuGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.roles.includes(userRole)),
        }))
        .filter((group) => group.items.length > 0)
    : [];

  const toggleGroup = (heading: string) => {
    setExpandedGroups((prev) =>
      prev.includes(heading)
        ? prev.filter((h) => h !== heading)
        : [...prev, heading],
    );
  };

  const handleItemClick = (href: string) => {
    setLoading(true);
    router.push(href);
    onItemClick?.();
  };

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  if (status === "loading") {
    return (
      <Flex
        p={4}
        pt={6}
        justifyContent="center"
        alignItems="center"
        height="100%"
      >
        <Spinner size="md" />
      </Flex>
    );
  }

  return (
    <Flex direction="column" h="full">
      {/* Header with App Logo and Name */}
      <Flex
        alignItems="center"
        justifyContent="center"
        p={4}
        bg={sidebarBg}
        position="sticky"
        top="0"
        zIndex="sticky"
        boxShadow="sm"
      >
        <Box
          bg="white"
          p={3}
          borderRadius="xl"
          boxShadow="md"
          display="flex"
          alignItems="center"
          justifyContent="center"
          onClick={() => handleItemClick("/")}
          cursor="pointer"
        >
          <Image
            src="/icons/icon-512x512.png"
            alt="Caterflow Logo"
            width={120}
            height={120}
          />
        </Box>
      </Flex>
      <Divider mb={4} borderColor={borderColor} />

      {/* Scrollable Menu Items */}
      <Flex
        direction="column"
        overflowY="auto"
        overflowX="hidden"
        flex="1"
        px={2}
      >
        <Stack direction="column" spacing={2} w="full">
          {filteredMenuGroups.map((group) => (
            <Box key={group.heading} w="full">
              <Flex
                as="button"
                w="full"
                alignItems="center"
                justifyContent="space-between"
                onClick={() => toggleGroup(group.heading)}
                py={2}
                px={3}
                _hover={{
                  bg: hoverBg,
                  borderRadius: "md",
                }}
              >
                <Flex align="center">
                  <Icon
                    as={group.icon}
                    boxSize={4}
                    mr={2}
                    color={textSecondaryColor}
                  />
                  <Text
                    fontSize="xs"
                    fontWeight="bold"
                    textTransform="uppercase"
                    color={textSecondaryColor}
                  >
                    {group.heading}
                  </Text>
                </Flex>
                <Icon
                  as={
                    expandedGroups.includes(group.heading)
                      ? FiChevronDown
                      : FiChevronUp
                  }
                  boxSize={4}
                  color={textSecondaryColor}
                />
              </Flex>
              <Collapse
                in={expandedGroups.includes(group.heading)}
                animateOpacity
              >
                <Stack spacing={1} pl={1} mt={1}>
                  {group.items.map((item) => (
                    <Button
                      key={item.href}
                      variant="ghost"
                      justifyContent="flex-start"
                      w="full"
                      leftIcon={<Icon as={item.icon} boxSize={5} />}
                      color={
                        pathname === item.href
                          ? theme.colors.brand["500"]
                          : iconColor
                      }
                      bg={pathname === item.href ? activeBg : "transparent"}
                      _hover={{ bg: activeBg }}
                      onClick={() => handleItemClick(item.href)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Stack>
              </Collapse>
            </Box>
          ))}
        </Stack>
      </Flex>

      {/* Footer with Actions */}
      <Box
        bg={sidebarBg}
        position="sticky"
        bottom="0"
        zIndex="sticky"
        p={4}
        boxShadow="sm"
      >
        <Divider my={4} borderColor={borderColor} />
        <Button
          w="full"
          variant="ghost"
          justifyContent="flex-start"
          leftIcon={<Icon as={colorMode === "light" ? SunIcon : MoonIcon} />}
          onClick={toggleColorMode}
        >
          Toggle Theme
        </Button>
        {isAuthenticated && (
          <Button
            w="full"
            variant="ghost"
            justifyContent="flex-start"
            leftIcon={<Icon as={FiUser} />}
            _hover={{ bg: activeBg }}
            onClick={() => handleItemClick("/profile")}
          >
            Profile
          </Button>
        )}
        {isAuthenticated && (
          <Button
            w="full"
            variant="ghost"
            justifyContent="flex-start"
            leftIcon={<Icon as={FiLogOut} />}
            _hover={{ bg: "red.500", color: "white" }}
            onClick={handleLogout}
          >
            Logout
          </Button>
        )}
      </Box>
    </Flex>
  );
};

export function Sidebar({ appName = "Caterflow" }: SidebarProps) {
  const isMobile = useBreakpointValue({ base: true, md: false });
  const { isOpen, closeSidebar } = useSidebar();
  const theme = useTheme();
  const sidebarBg = useColorModeValue(
    theme.colors.neutral.light["bg-secondary"],
    theme.colors.neutral.dark["bg-secondary"],
  );
  const borderColor = useColorModeValue(
    theme.colors.neutral.light["border-color"],
    theme.colors.neutral.dark["border-color"],
  );

  if (isMobile) {
    return (
      <Drawer isOpen={isOpen} placement="left" onClose={closeSidebar}>
        <DrawerOverlay />
        <DrawerContent bg={sidebarBg} maxW={{ base: "60%", sm: "300px" }}>
          <DrawerCloseButton />
          <DrawerBody p={0}>
            <SidebarContent onItemClick={closeSidebar} />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Box
      as="aside"
      w="250px"
      bg={sidebarBg}
      borderRight="1px solid"
      borderColor={borderColor}
      position="fixed"
      left="0"
      top="0"
      h="100vh"
      p={4}
      pt={6}
      zIndex="sticky"
      flexDirection="column"
      justifyContent="space-between"
      display={{ base: "none", md: "flex" }}
    >
      <SidebarContent />
    </Box>
  );
}
