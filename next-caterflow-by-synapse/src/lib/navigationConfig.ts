import { IconType } from "react-icons";
import {
  FiHome,
  FiBarChart2,
  FiActivity,
  FiAlertTriangle,
  FiPackage,
  FiDatabase,
  FiList,
  FiAlertCircle,
  FiSettings,
  FiCheckCircle,
  FiShoppingCart,
  FiFileText,
  FiTruck,
  FiClipboard,
  FiRepeat,
  FiShoppingBag,
  FiUsers,
  FiMapPin,
  FiBriefcase,
  FiDatabase as FiDatabaseAlt,
} from "react-icons/fi";

export interface SidebarMenuItem {
  label: string;
  href: string;
  icon: IconType;
  roles: string[];
  bottomNavOrder?: number;
}

export interface SidebarMenuGroup {
  heading: string;
  icon: IconType;
  items: SidebarMenuItem[];
}

export const sidebarMenuGroups: SidebarMenuGroup[] = [
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
        bottomNavOrder: 1,
      },
      {
        label: "Activity",
        href: "/activity",
        icon: FiActivity,
        roles: ["admin", "siteManager", "stockController", "auditor"],
        bottomNavOrder: 2,
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
        bottomNavOrder: 2,
      },
      {
        label: "Stock Items",
        href: "/stock-items",
        icon: FiList,
        roles: ["admin", "siteManager", "stockController", "procurer"],
        bottomNavOrder: 4,
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
        bottomNavOrder: 4,
      },
      {
        label: "Purchases",
        href: "/operations/purchases",
        icon: FiShoppingCart,
        roles: ["admin", "siteManager", "stockController", "auditor"],
        bottomNavOrder: 3,
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
        bottomNavOrder: 3,
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
      {
        label: "Users",
        href: "/users",
        icon: FiUsers,
        roles: ["admin"],
      },
      {
        label: "Dispatch Types",
        href: "/dispatch-types",
        icon: FiTruck,
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
      {
        label: "Archive",
        href: "/admin/archive",
        icon: FiDatabaseAlt,
        roles: ["admin"],
      },
    ],
  },
];

export const getFilteredMenuGroups = (userRole?: string) => {
  if (!userRole) {
    return [];
  }

  return sidebarMenuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((group) => group.items.length > 0);
};

export const getBottomNavItems = (
  userRole?: string,
  maxItems = 4,
): Array<SidebarMenuItem> => {
  const menuItems = sidebarMenuGroups
    .flatMap((group) => group.items)
    .filter((item) => !userRole || item.roles.includes(userRole));

  const bottomItems = menuItems
    .filter((item) => item.bottomNavOrder !== undefined)
    .sort((a, b) => {
      if (a.bottomNavOrder === b.bottomNavOrder) return 0;
      if (a.bottomNavOrder === undefined) return 1;
      if (b.bottomNavOrder === undefined) return -1;
      return a.bottomNavOrder - b.bottomNavOrder;
    });

  if (bottomItems.length > 0) {
    return bottomItems.slice(0, maxItems);
  }

  return menuItems.slice(0, maxItems);
};
