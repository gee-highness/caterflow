// src/app/theme/theme.ts - StockWise Edition
import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import { mode } from '@chakra-ui/theme-tools';

// 1. Natural StockWise Color Palette (Strawberry & Green theme)
const colors = {
  brand: {
    // Primary - Natural Strawberry Red
    50: '#FFEBEE',
    100: '#FFCDD2',
    200: '#EF9A9A',
    300: '#E57373',
    400: '#EF5350',
    500: '#DC143C', // Primary strawberry red
    600: '#C2185B',
    700: '#AD1457',
    800: '#880E4F',
    900: '#640D4C',
  },
  accent: {
    // Natural food-inspired colors
    green: '#228B22', // Forest Green - healthy stock
    lightGreen: '#32CD32', // Lime Green - fresh items
    red: '#DC143C', // Crimson - low stock/urgent
    orange: '#FF8C00', // Dark Orange - expiring soon
    purple: '#9370DB', // Medium Purple - transfers
    brown: '#8B4513', // Saddle Brown - containers/baskets
    pink: '#FF69B4', // Hot Pink - special items
    yellow: '#FFD700', // Gold - premium items
  },
  neutral: {
    light: {
      'bg-primary': '#FAF9F5', // Warm off-white, like natural paper
      'bg-secondary': '#FFFFFF',
      'bg-header': '#FFFFFF',
      'bg-card': '#FFFFFF',
      'text-primary': '#2D3748', // Charcoal
      'text-secondary': '#718096',
      'border-color': '#E2E8F0',
      'input-bg': '#FFFFFF',
      'input-border': '#CBD5E0',
      'placeholder-color': '#A0AEC0',
      'tag-bg': '#EDF2F7',
      'tag-color': '#4A5568',
      'status-green': '#228B22', // Forest Green
      'status-orange': '#FF8C00', // Dark Orange
      'status-red': '#DC143C', // Crimson
      'status-purple': '#9370DB', // Medium Purple
      'status-pink': '#FF69B4', // Hot Pink
      'status-brown': '#8B4513', // Saddle Brown
    },
    dark: {
      'bg-primary': '#0F172A', // Deep navy blue
      'bg-secondary': '#1E293B',
      'bg-header': '#1E293B',
      'bg-card': '#1E293B',
      'text-primary': '#F1F5F9',
      'text-secondary': '#CBD5E1',
      'border-color': '#334155',
      'input-bg': '#1E293B',
      'input-border': '#475569',
      'placeholder-color': '#94A3B8',
      'tag-bg': '#334155',
      'tag-color': '#E2E8F0',
      'status-green': '#32CD32', // Lime Green (brighter for dark mode)
      'status-orange': '#FFA500', // Orange
      'status-red': '#FF6B6B', // Light Red
      'status-purple': '#B794F4', // Light Purple
      'status-pink': '#FF69B4', // Hot Pink
      'status-brown': '#D2691E', // Chocolate
    },
  },
};

// 2. Configure initial color mode (same structure)
const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

// 3. Define global styles (same structure with updated colors)
const styles = {
  global: (props: Record<string, any>) => ({
    body: {
      bg: mode(colors.neutral.light['bg-primary'], colors.neutral.dark['bg-primary'])(props),
      color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      fontSmooth: 'antialiased',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    },
    'html, #__next': {
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    },
    '.page-transition-overlay': {
      backgroundColor: mode('rgba(255, 255, 255, 0.95)', 'rgba(15, 23, 42, 0.95)')(props),
    },
    '.wipe-row': {
      backgroundColor: mode(colors.brand[500], colors.brand[500])(props),
    },
    '.loading-spinner-container': {
      backgroundColor: mode(colors.neutral.light['bg-primary'], colors.neutral.dark['bg-primary'])(props),
      boxShadow: mode('lg', 'dark-lg')(props),
      borderRadius: 'md',
      padding: '4',
    },
    a: {
      color: mode(colors.brand[500], colors.brand[300])(props),
      _hover: {
        textDecoration: 'underline',
      },
    },
    '::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '::-webkit-scrollbar-track': {
      background: mode('#F1F1F1', '#2A2A2A')(props),
      borderRadius: '4px',
    },
    '::-webkit-scrollbar-thumb': {
      background: mode('#C1C1C1', '#404040')(props),
      borderRadius: '4px',
    },
    '::-webkit-scrollbar-thumb:hover': {
      background: mode('#A8A8A8', '#505050')(props),
    },
    '::selection': {
      backgroundColor: mode('rgba(220, 20, 60, 0.2)', 'rgba(220, 20, 60, 0.4)')(props),
    },
  }),
};

// 4. Component overrides (same structure, updated colors)
const components = {
  Button: {
    baseStyle: (props: Record<string, any>) => ({
      fontWeight: 'semibold',
      borderRadius: 'lg',
      _focus: {
        boxShadow: 'outline',
      },
      _active: {
        transform: 'scale(0.98)',
      },
      transition: 'all 0.2s ease-in-out',
    }),
    variants: {
      solid: (props: Record<string, any>) => ({
        bg: props.colorScheme === 'brand' ? mode(colors.brand[500], colors.brand[500])(props) : undefined,
        color: props.colorScheme === 'brand' ? 'white' : undefined,
        _hover: {
          bg: props.colorScheme === 'brand' ? mode(colors.brand[600], colors.brand[600])(props) : undefined,
          boxShadow: 'md',
          _disabled: {
            bg: mode('gray.200', 'whiteAlpha.300')(props),
          },
        },
        _active: {
          bg: props.colorScheme === 'brand' ? mode(colors.brand[700], colors.brand[700])(props) : undefined,
        },
      }),
      outline: (props: Record<string, any>) => ({
        borderColor: props.colorScheme === 'brand' ? mode(colors.brand[500], colors.brand[400])(props) : mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
        color: props.colorScheme === 'brand' ? mode(colors.brand[500], colors.brand[400])(props) : mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        _hover: {
          bg: props.colorScheme === 'brand' ? mode(colors.brand[50], colors.brand[900])(props) : mode(colors.neutral.light['bg-secondary'], colors.neutral.dark['bg-secondary'])(props),
          borderColor: props.colorScheme === 'brand' ? mode(colors.brand[600], colors.brand[500])(props) : undefined,
          boxShadow: 'sm',
        },
      }),
      ghost: (props: Record<string, any>) => ({
        color: mode(colors.neutral.light['text-secondary'], colors.neutral.dark['text-secondary'])(props),
        _hover: {
          bg: mode(colors.neutral.light['tag-bg'], colors.neutral.dark['tag-bg'])(props),
          color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        },
      }),
    },
  },
  Card: {
    baseStyle: (props: Record<string, any>) => ({
      container: {
        bg: mode(colors.neutral.light['bg-card'], colors.neutral.dark['bg-card'])(props),
        borderRadius: 'xl',
        boxShadow: mode('md', 'dark-md')(props),
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
        borderWidth: '1px',
        transition: 'all 0.2s ease-in-out',
        backdropFilter: 'blur(10px)',
      },
    }),
  },
  Link: {
    baseStyle: (props: Record<string, any>) => ({
      color: mode(colors.brand[500], colors.brand[300])(props),
      _hover: {
        textDecoration: 'underline',
        color: mode(colors.brand[600], colors.brand[400])(props),
      },
    }),
  },
  Input: {
    variants: {
      outline: (props: Record<string, any>) => ({
        field: {
          bg: mode(colors.neutral.light['input-bg'], colors.neutral.dark['input-bg'])(props),
          borderColor: mode(colors.neutral.light['input-border'], colors.neutral.dark['input-border'])(props),
          _hover: {
            borderColor: mode(colors.brand[300], colors.brand[400])(props),
          },
          _focusVisible: {
            borderColor: mode(colors.brand[500], colors.brand[300])(props),
            boxShadow: `0 0 0 1px ${mode(colors.brand[500], colors.brand[300])(props)}`,
          },
          _placeholder: {
            color: mode(colors.neutral.light['placeholder-color'], colors.neutral.dark['placeholder-color'])(props),
          },
        },
      }),
    },
  },
  Textarea: {
    variants: {
      outline: (props: Record<string, any>) => ({
        bg: mode(colors.neutral.light['input-bg'], colors.neutral.dark['input-input-bg'])(props),
        borderColor: mode(colors.neutral.light['input-border'], colors.neutral.dark['input-border'])(props),
        _hover: {
          borderColor: mode(colors.brand[300], colors.brand[400])(props),
        },
        _focusVisible: {
          borderColor: mode(colors.brand[500], colors.brand[300])(props),
          boxShadow: `0 0 0 1px ${mode(colors.brand[500], colors.brand[300])(props)}`,
        },
        _placeholder: {
          color: mode(colors.neutral.light['placeholder-color'], colors.neutral.dark['placeholder-color'])(props),
        },
      }),
    },
  },
  Select: {
    variants: {
      outline: (props: Record<string, any>) => ({
        field: {
          bg: mode(colors.neutral.light['input-bg'], colors.neutral.dark['input-bg'])(props),
          borderColor: mode(colors.neutral.light['input-border'], colors.neutral.dark['input-border'])(props),
          _hover: {
            borderColor: mode(colors.brand[300], colors.brand[400])(props),
          },
          _focusVisible: {
            borderColor: mode(colors.brand[500], colors.brand[300])(props),
            boxShadow: `0 0 0 1px ${mode(colors.brand[500], colors.brand[300])(props)}`,
          },
          _placeholder: {
            color: mode(colors.neutral.light['placeholder-color'], colors.neutral.dark['placeholder-color'])(props),
          },
        },
      }),
    },
  },
  Tag: {
    baseStyle: (props: Record<string, any>) => ({
      container: {
        bg: mode(colors.neutral.light['tag-bg'], colors.neutral.dark['tag-bg'])(props),
        color: mode(colors.neutral.light['tag-color'], colors.neutral.dark['tag-color'])(props),
        borderRadius: 'md',
      },
    }),
    variants: {
      subtle: (props: Record<string, any>) => {
        let bgColor = '';
        let textColor = '';
        if (props.colorScheme === 'green') {
          bgColor = mode(colors.neutral.light['status-green'], colors.neutral.dark['status-green'])(props);
          textColor = mode('white', 'white')(props);
        } else if (props.colorScheme === 'orange') {
          bgColor = mode(colors.neutral.light['status-orange'], colors.neutral.dark['status-orange'])(props);
          textColor = mode('white', 'white')(props);
        } else if (props.colorScheme === 'red') {
          bgColor = mode(colors.neutral.light['status-red'], colors.neutral.dark['status-red'])(props);
          textColor = mode('white', 'white')(props);
        } else if (props.colorScheme === 'purple') {
          bgColor = mode(colors.neutral.light['status-purple'], colors.neutral.dark['status-purple'])(props);
          textColor = mode('white', 'white')(props);
        } else if (props.colorScheme === 'pink') {
          bgColor = mode(colors.neutral.light['status-pink'], colors.neutral.dark['status-pink'])(props);
          textColor = mode('white', 'white')(props);
        } else if (props.colorScheme === 'brown') {
          bgColor = mode(colors.neutral.light['status-brown'], colors.neutral.dark['status-brown'])(props);
          textColor = mode('white', 'white')(props);
        } else {
          bgColor = mode('gray.100', 'whiteAlpha.300')(props);
          textColor = mode('gray.800', 'whiteAlpha.800')(props);
        }
        return {
          container: {
            bg: bgColor,
            color: textColor,
          },
        };
      },
    },
  },
  Table: {
    baseStyle: (props: Record<string, any>) => ({
      th: {
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
        fontWeight: 'bold',
        textTransform: 'capitalize',
      },
      td: {
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
      },
      container: {
        bg: mode(colors.neutral.light['bg-card'], colors.neutral.dark['bg-card'])(props),
        borderRadius: 'lg',
        boxShadow: mode('md', 'dark-md')(props),
        border: '1px solid',
        borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
      },
    }),
  },
  Menu: {
    baseStyle: (props: Record<string, any>) => ({
      list: {
        bg: mode('white', colors.neutral.dark['bg-card'])(props),
        border: 'none',
        borderRadius: 'lg',
        boxShadow: mode('lg', 'dark-lg')(props),
        py: 2,
        backdropFilter: 'blur(10px)',
      },
      item: {
        bg: 'transparent',
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        _hover: {
          bg: mode(colors.neutral.light['tag-bg'], colors.neutral.dark['tag-bg'])(props),
        },
        _focus: {
          bg: mode(colors.neutral.light['tag-bg'], colors.neutral.dark['tag-bg'])(props),
        },
      },
    }),
  },
  Modal: {
    baseStyle: (props: Record<string, any>) => ({
      dialog: {
        bg: mode(colors.neutral.light['bg-card'], colors.neutral.dark['bg-card'])(props),
        borderRadius: 'xl',
        boxShadow: mode('xl', 'dark-xl')(props),
        backdropFilter: 'blur(10px)',
      },
      header: {
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
        fontWeight: 'semibold',
      },
      body: {
        color: mode(colors.neutral.light['text-primary'], colors.neutral.dark['text-primary'])(props),
      },
    }),
  },
  Divider: {
    baseStyle: (props: Record<string, any>) => ({
      borderColor: mode(colors.neutral.light['border-color'], colors.neutral.dark['border-color'])(props),
    }),
  },
};

// 5. Extend the theme
const theme = extendTheme({
  config,
  colors,
  styles,
  components,
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
    md: '0 4px 6px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
    lg: '0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05)',
    xl: '0 20px 25px rgba(0,0,0,0.1), 0 10px 10px rgba(0,0,0,0.04)',
    'dark-sm': '0 1px 3px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
    'dark-md': '0 4px 6px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.15)',
    'dark-lg': '0 10px 15px rgba(0,0,0,0.25), 0 4px 6px rgba(0,0,0,0.2)',
    'dark-xl': '0 20px 25px rgba(0,0,0,0.35), 0 10px 10px rgba(0,0,0,0.25)',
    outline: `0 0 0 3px ${colors.brand[500]}20`,
  },
  fonts: {
    heading: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`,
    body: `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`,
  },
  transitions: {
    property: {
      common: 'background-color, border-color, color, fill, stroke, opacity, box-shadow, transform',
    },
    duration: {
      fast: '150ms',
      normal: '200ms',
      slow: '300ms',
    },
  },
  layerStyles: {
    'mac-card': {
      bg: 'white',
      borderRadius: 'xl',
      boxShadow: 'md',
      border: '1px solid',
      borderColor: 'border-color',
      backdropFilter: 'blur(10px)',
    },
    'mac-card-dark': {
      bg: 'neutral.dark.bg-card',
      borderRadius: 'xl',
      boxShadow: 'dark-md',
      border: '1px solid',
      borderColor: 'border-color',
      backdropFilter: 'blur(10px)',
    },
  },
});

export default theme;