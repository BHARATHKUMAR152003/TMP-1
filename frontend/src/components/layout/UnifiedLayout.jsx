import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Avatar, Badge, Box, Divider, Drawer, IconButton, InputBase, List, ListItemButton,
  ListItemIcon, ListItemText, Menu, MenuItem, Toolbar, Tooltip, Typography, ListItemAvatar,
  ThemeProvider, useMediaQuery, alpha, lighten,
} from '@mui/material';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import { useAuth } from '../../context/AuthContext.jsx';
import { buildTheme, CMYK_STRIPE } from '../../theme/theme.js';
import { ROLE_COLORS, ROLE_LABELS, ROLE_MENUS } from '../../config/constants.js';
import { initials, formatDateTime } from '../../utils/format.js';
import * as notificationService from '../../services/notification.service.js';

const DRAWER_WIDTH = 260;
// Width of the invisible strip along the left edge that reveals the sidebar.
const HOVER_EDGE = 16;

export default function UnifiedLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const accent = ROLE_COLORS[user?.role] || ROLE_COLORS.admin;
  // Readable tint of the accent for text on the dark ink chrome.
  const accentOnInk = lighten(accent, 0.55);
  const roleTheme = useMemo(() => buildTheme(accent), [accent]);
  const menu = ROLE_MENUS[user?.role] || [];
  const showSidebar = menu.length > 0;

  const isDesktop = useMediaQuery(roleTheme.breakpoints.up('md'));
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [anchorEl, setAnchorEl] = useState(null);
  const [notifAnchor, setNotifAnchor] = useState(null);
  const [notifications, setNotifications] = useState({ items: [], unread: 0 });

  // Poll notifications lightly so the bell stays current.
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await notificationService.listNotifications({ limit: 15 });
        if (active) setNotifications(data);
      } catch {
        /* non-critical */
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, isDesktop]);

  const handleSearch = (e) => {
    e.preventDefault();
    const term = search.trim();
    if (term) navigate(`/orders?search=${encodeURIComponent(term)}`);
  };

  const openNotifications = async (e) => {
    setNotifAnchor(e.currentTarget);
    if (notifications.unread > 0) {
      try {
        await notificationService.markAllRead();
        setNotifications((prev) => ({ ...prev, unread: 0 }));
      } catch {
        /* ignore */
      }
    }
  };

  // Nested routes (e.g. /orders/new) keep their parent nav item highlighted.
  const menuMatch = (path) =>
    path === '/dashboard'
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ height: 4, background: CMYK_STRIPE }} />
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar variant="rounded" sx={{ bgcolor: accent, width: 40, height: 40 }}>
          <PrintRoundedIcon />
        </Avatar>
        <Box>
          <Typography variant="h6" sx={{ lineHeight: 1.1, color: '#fff' }}>
            TMP
          </Typography>
          <Typography variant="caption" sx={{ color: accentOnInk, fontWeight: 600 }}>
            {ROLE_LABELS[user?.role] || 'Portal'}
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: alpha('#fff', 0.08) }} />
      <List sx={{ px: 1.5, py: 1, flex: 1, overflowY: 'auto' }}>
        {menu.map((item) => {
          const selected = menuMatch(item.path);
          const Icon = item.icon;
          return (
            <ListItemButton
              key={item.path}
              selected={selected}
              onClick={() => navigate(item.path)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                '&:hover': { bgcolor: alpha('#fff', 0.06) },
                '&.Mui-selected': {
                  bgcolor: alpha(accent, 0.35),
                  boxShadow: `inset 3px 0 0 ${accentOnInk}`,
                  '&:hover': { bgcolor: alpha(accent, 0.45) },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: selected ? '#fff' : alpha('#fff', 0.6) }}>
                <Icon />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontWeight: selected ? 700 : 500, color: selected ? '#fff' : alpha('#fff', 0.75) }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Divider sx={{ borderColor: alpha('#fff', 0.08) }} />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: accent }}>{initials(user?.name)}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ color: '#fff' }}>
            {user?.name}
          </Typography>
          <Typography variant="caption" noWrap sx={{ textTransform: 'capitalize', color: alpha('#fff', 0.6) }}>
            {user?.role}
          </Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <ThemeProvider theme={roleTheme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar
          position="fixed"
          elevation={0}
          sx={{ width: '100%' }}
        >
          <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: CMYK_STRIPE }} />
          <Toolbar sx={{ gap: 1 }}>
            {showSidebar && (
              <Tooltip title="Menu (or move the cursor to the left edge)">
                <IconButton color="inherit" edge="start" onClick={() => setNavOpen((v) => !v)}>
                  <MenuRoundedIcon />
                </IconButton>
              </Tooltip>
            )}

            <Box
              onClick={() => navigate('/dashboard')}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 2, cursor: 'pointer' }}
            >
              <Avatar variant="rounded" sx={{ bgcolor: accent, width: 38, height: 38 }}>
                <PrintRoundedIcon />
              </Avatar>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                  TMP
                </Typography>
                <Typography variant="caption" sx={{ color: accentOnInk, fontWeight: 600 }}>
                  {ROLE_LABELS[user?.role] || 'Portal'}
                </Typography>
              </Box>
            </Box>

            <Box
              component="form"
              onSubmit={handleSearch}
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                bgcolor: alpha('#fff', 0.08),
                border: '1px solid',
                borderColor: alpha('#fff', 0.12),
                transition: 'background-color .2s, border-color .2s',
                '&:focus-within': { bgcolor: alpha('#fff', 0.14), borderColor: accentOnInk },
                width: 320,
                maxWidth: '40vw',
              }}
            >
              <SearchRoundedIcon fontSize="small" sx={{ color: alpha('#fff', 0.6) }} />
              <InputBase
                placeholder="Search invoices, customers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: 1, fontSize: 14, color: '#fff', '& input::placeholder': { color: alpha('#fff', 0.55), opacity: 1 } }}
              />
            </Box>

            <Box sx={{ flexGrow: 1 }} />

            <Tooltip title="Notifications">
              <IconButton color="inherit" onClick={openNotifications}>
                <Badge badgeContent={notifications.unread} color="error">
                  <NotificationsRoundedIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title="Account">
              <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ ml: 0.5 }}>
                <Avatar sx={{ bgcolor: accent, width: 34, height: 34, fontSize: 15 }}>
                  {initials(user?.name)}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>

        {/* Sidebar stays out of the way: it slides over the page when the cursor
            reaches the left edge (or the menu button is pressed). */}
        {showSidebar && (
          <>
            <Box
              onMouseEnter={() => isDesktop && setNavOpen(true)}
              sx={{
                display: { xs: 'none', md: 'block' },
                position: 'fixed',
                top: 0,
                left: 0,
                width: HOVER_EDGE,
                height: '100vh',
                zIndex: (t) => t.zIndex.drawer + 2,
              }}
            />
            <Drawer
              variant="temporary"
              open={navOpen}
              onClose={() => setNavOpen(false)}
              ModalProps={{ keepMounted: true }}
              slotProps={{
                paper: {
                  onMouseLeave: () => isDesktop && setNavOpen(false),
                  sx: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
                },
              }}
            >
              {drawer}
            </Drawer>
          </>
        )}

        <Box component="main" sx={{ flexGrow: 1, width: '100%' }}>
          <Toolbar />
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Outlet />
          </Box>
        </Box>

        {/* Account menu */}
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2">{user?.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              navigate('/profile');
            }}
          >
            <ListItemIcon>
              <PersonRoundedIcon fontSize="small" />
            </ListItemIcon>
            My Profile
          </MenuItem>
          <MenuItem
            onClick={() => {
              setAnchorEl(null);
              logout();
              navigate('/login');
            }}
          >
            <ListItemIcon>
              <LogoutRoundedIcon fontSize="small" />
            </ListItemIcon>
            Logout
          </MenuItem>
        </Menu>

        {/* Notifications menu */}
        <Menu
          anchorEl={notifAnchor}
          open={Boolean(notifAnchor)}
          onClose={() => setNotifAnchor(null)}
          slotProps={{ paper: { sx: { width: 360, maxHeight: 420 } } }}
        >
          <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Notifications
            </Typography>
            <DoneAllRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          </Box>
          <Divider />
          {notifications.items.length === 0 && (
            <MenuItem disabled>
              <Typography variant="body2">You're all caught up</Typography>
            </MenuItem>
          )}
          {notifications.items.map((n) => (
            <MenuItem key={n.id} sx={{ whiteSpace: 'normal', alignItems: 'flex-start' }}>
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: alpha(accent, 0.2), color: accent, width: 34, height: 34 }}>
                  <NotificationsRoundedIcon fontSize="small" />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={n.title}
                secondary={formatDateTime(n.created_at)}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
              />
            </MenuItem>
          ))}
        </Menu>
      </Box>
    </ThemeProvider>
  );
}
