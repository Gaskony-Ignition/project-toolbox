/**
 * Main App component with two-level tab navigation
 *
 * Uses React.lazy for code splitting - heavier pages are loaded on-demand
 * to improve initial bundle size and load performance.
 *
 * Tab state is managed in Zustand (persisted to localStorage).
 * No client-side routing — all navigation is tab-based.
 */

import { useMemo, Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider, createTheme, CircularProgress, Box, Typography, Divider } from '@mui/material';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Playbooks } from './pages/Playbooks';
import { Executions } from './pages/Executions';
import { Settings } from './pages/Settings';

import { WelcomeDialog } from './components/WelcomeDialog';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';

// Lazy-loaded pages for code splitting (reduces initial bundle size)
const ExecutionDetail = lazy(() => import('./pages/ExecutionDetail').then(m => ({ default: m.ExecutionDetail })));
const APIExplorer = lazy(() => import('./pages/APIExplorer').then(m => ({ default: m.APIExplorer })));
const StackBuilder = lazy(() => import('./pages/StackBuilder').then(m => ({ default: m.StackBuilder })));
const Audit = lazy(() => import('./pages/Audit').then(m => ({ default: m.Audit })));
const UdtBuilder = lazy(() => import('./pages/UdtBuilder').then(m => ({ default: m.UdtBuilder })));

// Loading fallback for lazy-loaded components
function PageLoader() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
      <CircularProgress />
    </Box>
  );
}

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Dark Navy Blue Color Palette (matching CW Dashboard)
const themeColors = {
  dark: {
    background: '#0F172A',      // Navy blue background
    surface: '#1E293B',         // Lighter panel surface
    surfaceVariant: '#1E293B',
    border: '#334155',          // Slate border
    // Blue 500 (#3B82F6) and Red 500 (#EF4444) read fine on the page
    // background but drop under 4.5:1 as plain text on the lighter card
    // surface (#1E293B) -- Blue 400 / Red 400 keep the same hue family and
    // pass on both (WCAG 1.4.3). Contained buttons need a darker blue
    // behind white text instead; see the MuiButton override below.
    primary: '#60A5FA',         // Blue 400
    secondary: '#1D4ED8',       // Blue 700
    success: '#22C55E',         // Green 500
    warning: '#F59E0B',         // Amber 500
    error: '#F87171',           // Red 400
    text: '#F8FAFC',            // Slate 50
    textSecondary: '#94A3B8',   // Slate 400
  },
  light: {
    background: '#ffffff',
    surface: '#f6f8fa',
    surfaceVariant: '#f0f3f6',
    border: '#d0d7de',
    primary: '#0969da',
    secondary: '#0550ae',
    success: '#1a7f37',
    warning: '#9a6700',
    error: '#cf222e',
    text: '#24292f',
    textSecondary: '#57606a',
  },
};

/**
 * Create MUI theme from the current theme mode.
 */
function createAppTheme(themeMode: 'dark' | 'light') {
  const colors = themeColors[themeMode];

  return createTheme({
    palette: {
      mode: themeMode,
      primary: {
        main: colors.primary,
        light: themeMode === 'dark' ? '#79c0ff' : '#54aeff',
        dark: colors.secondary,
        // MUI derives contrastText from primary.main's own lightness, which
        // now picks black once main is the lighter Blue 400 (needed as
        // plain text, above) -- but the containedPrimary/filledPrimary
        // overrides below always paint a darker blue behind that text, so
        // white is the one that actually passes there (WCAG 1.4.3).
        ...(themeMode === 'dark' && { contrastText: '#ffffff' }),
      },
      secondary: {
        main: colors.secondary,
      },
      success: {
        main: colors.success,
      },
      warning: {
        main: colors.warning,
      },
      error: {
        main: colors.error,
        ...(themeMode === 'dark' && { contrastText: '#ffffff' }),
      },
      background: {
        default: colors.background,
        paper: colors.surface,
      },
      text: {
        primary: colors.text,
        secondary: colors.textSecondary,
      },
      divider: colors.border,
    },
    components: {
      // A visible focus ring for every element that can take keyboard focus
      // (WCAG 2.4.7). MUI's own focus-visible treatment is a background
      // tint, not an outline, so it never showed up as a ring at all on
      // plain divs like ListItemButton (no wrapping <li>) or a custom
      // clickable row -- this is the one global rule that covers all of
      // them, instead of patching each component's own focus style.
      MuiCssBaseline: {
        styleOverrides: {
          // !important: several MUI components (ButtonBase among them) set
          // their own `outline: 0` at the class level, which otherwise
          // outranks this plain pseudo-class selector regardless of sheet
          // order.
          ':focus-visible': {
            outline: `2px solid ${colors.primary} !important`,
            outlineOffset: '2px',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        },
      },
      // role="progressbar" needs its own accessible name wherever it renders
      // (WCAG 4.1.2) -- most spinners here swap in for an already-labelled
      // button's icon, but a few are standalone loading states. One default
      // covers every case; a specific spot can still pass its own
      // aria-label to override it.
      MuiCircularProgress: {
        defaultProps: {
          'aria-label': 'Loading',
        },
      },
      // The brand blue and red (as bare text, now Blue 400 / Red 400 above)
      // only reach ~2.5-2.8:1 against white button text — well under the
      // 4.5:1 floor (WCAG 1.4.3). Dark mode's surfaces are dark enough that
      // a deeper shade is needed behind white text specifically; light
      // mode's primary already passes as-is (5.2:1) against white, so it's
      // left alone.
      ...(themeMode === 'dark' && {
        MuiButton: {
          styleOverrides: {
            containedPrimary: {
              backgroundColor: '#2563eb',
              '&:hover': { backgroundColor: colors.secondary },
            },
            containedError: {
              backgroundColor: '#dc2626',
              '&:hover': { backgroundColor: '#b91c1c' },
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            filledPrimary: { backgroundColor: '#2563eb' },
            filledError: { backgroundColor: '#dc2626' },
          },
        },
      }),
    },
  });
}

function AppContent() {
  const mainTab = useStore((state) => state.mainTab);
  const playbookSubTab = useStore((state) => state.playbookSubTab);
  const activeExecutionId = useStore((state) => state.activeExecutionId);
  const setExecutionUpdate = useStore((state) => state.setExecutionUpdate);
  const setScreenshotFrame = useStore((state) => state.setScreenshotFrame);
  const themeMode = useStore((state) => state.theme);

  // Create theme based on current mode from store
  const theme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  // Connect to WebSocket for real-time updates (silent - no UI indicators)
  useWebSocket({
    onExecutionUpdate: (update) => setExecutionUpdate(update.execution_id, update),
    onScreenshotFrame: (frame) => setScreenshotFrame(frame.executionId, frame),
  });

  // Render content based on main tab and sub-tab
  const renderContent = () => {
    switch (mainTab) {
      case 'playbooks':
        switch (playbookSubTab) {
          case 'gateway':
            return <Playbooks domainFilter="gateway" />;
          case 'perspective':
            return (
              <>
                <Playbooks domainFilter="perspective" />
                <Divider sx={{ my: 4 }} />
                <Suspense fallback={<PageLoader />}>
                  <Audit />
                </Suspense>
              </>
            );
          case 'active-execution':
            if (!activeExecutionId) {
              // De-emphasised via text.secondary alone, not opacity: halving
              // opacity on top of an already-muted colour drops it below the
              // 4.5:1 contrast floor (WCAG 1.4.3).
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                  <Typography variant="h6" color="text.secondary" gutterBottom>
                    No Active Execution
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Run a playbook to see execution progress here
                  </Typography>
                </Box>
              );
            }
            return (
              <Suspense fallback={<PageLoader />}>
                <ExecutionDetail executionId={activeExecutionId} />
              </Suspense>
            );
          case 'past-executions':
            return <Executions />;
          default:
            return <Playbooks domainFilter="gateway" />;
        }
      case 'api':
        return (
          <Suspense fallback={<PageLoader />}>
            <APIExplorer />
          </Suspense>
        );
      case 'stackbuilder':
        return (
          <Suspense fallback={<PageLoader />}>
            <StackBuilder />
          </Suspense>
        );
      case 'udtbuilder':
        return (
          <Suspense fallback={<PageLoader />}>
            <UdtBuilder />
          </Suspense>
        );
      case 'settings':
        return <Settings />;
      default:
        return <Playbooks domainFilter="gateway" />;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Layout>
        {renderContent()}
      </Layout>
      {/* Welcome dialog for first-time users */}
      <WelcomeDialog />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
