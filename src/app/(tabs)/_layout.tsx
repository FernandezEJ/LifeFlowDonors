import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { type ReactNode } from 'react';
import { TabLeaveProvider, useTabLeave } from '@/contexts/tab-leave-context';
import { type ColorValue, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { SlidingTabBar } from '@/components/sliding-tab-bar';

const COLORS = {
  background: PALETTE.cream,
  brand: PALETTE.primary,
  inactive: PALETTE.neutral,
  border: PALETTE.border,
};

const TAB_BAR_HEIGHT = 68;
const TAB_BAR_GAP = 6;

type TabIconProps = {
  color: ColorValue;
  focused: boolean;
  name: 'home' | 'directions-run' | 'stars' | 'monitor-heart' | 'person';
};

function TabIcon({ color, name }: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <MaterialIcons name={name} color={color} size={22} />
    </View>
  );
}

type CommunityTabIconProps = {
  color: ColorValue;
  focused: boolean;
  name: 'list-box-outline' | 'progress-star-four-points';
};

function CommunityTabIcon({ color, name }: CommunityTabIconProps) {
  return (
    <View style={styles.iconContainer}>
      <MaterialCommunityIcons name={name} color={color} size={22} />
    </View>
  );
}

// These five screens are light even when the device (and Flowie) use a dark theme.
// Match native/lazy scene backgrounds before each screen's own surface mounts.
const tabTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: PALETTE.cream, card: PALETTE.cream, text: PALETTE.text, primary: PALETTE.primary, border: PALETTE.border } };
export default function TabLayout() { return <ThemeProvider value={tabTheme}><TabLeaveProvider><MainTabs /></TabLeaveProvider></ThemeProvider>; }

// Keep the top Safe Area uniformly cream; circles sit behind the opaque tab headers.
function TabScreenBackground({ children, topInset }: { children: ReactNode; topInset: number }) {
  return <View style={styles.screen}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.backgroundAccents, { top: topInset }]}>
      <View style={styles.topAccent} />
      <View style={styles.bottomAccent} />
    </View>
    {children}
  </View>;
}

function MainTabs() {
  const { requestLeave } = useTabLeave();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const tabBarHeight = Math.max(TAB_BAR_HEIGHT, 52 + Math.ceil(14 * fontScale));
  const bottomInset = Math.max(insets.bottom, 10);
  const tabBarBottom = bottomInset + TAB_BAR_GAP;
  const contentBottomClearance = tabBarHeight + tabBarBottom + 8;

  return (
    <Tabs
      tabBar={props => <SlidingTabBar {...props} />}
      screenLayout={({ children }) => <TabScreenBackground topInset={insets.top}>{children}</TabScreenBackground>}
      screenListeners={({ navigation, route }) => ({ tabPress: event => {
        const state = navigation.getState();
        if (state.routes[state.index].name === 'profile' && route.name !== 'profile') {
          event.preventDefault();
          requestLeave(() => navigation.navigate(route.name));
        }
      } })}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarButton: HapticTab,
        tabBarLabelPosition: 'below-icon',
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        sceneStyle: {
          paddingBottom: contentBottomClearance,
          backgroundColor: COLORS.background,
        },
        tabBarIconStyle: styles.tabBarIcon,
        tabBarItemStyle: styles.tabBarItem,
        tabBarLabel: ({ children, color, focused }) => (
          <Text
            numberOfLines={1}
            style={[styles.tabBarLabel, { color }, focused && styles.tabBarLabelActive]}>
            {children}
          </Text>
        ),
        tabBarStyle: [
          styles.tabBar,
          {
            bottom: tabBarBottom,
            height: tabBarHeight,
          },
        ],
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, focused }) => (
            <CommunityTabIcon name="list-box-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Points',
          tabBarIcon: ({ color, focused }) => (
            <CommunityTabIcon
              name="progress-star-four-points"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'Status',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="monitor-heart" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  backgroundAccents: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  topAccent: { position: 'absolute', width: 420, height: 420, borderRadius: 210, top: -300, right: -310, backgroundColor: PALETTE.decorativeTop, opacity: 0.35 },
  bottomAccent: { position: 'absolute', width: 460, height: 460, borderRadius: 230, bottom: -280, left: -290, backgroundColor: PALETTE.decorativeBottom, opacity: 0.65 },
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingTop: 5,
    paddingBottom: 5,
    borderWidth: 0,
    borderTopWidth: 0,
    borderRadius: 0,
    backgroundColor: COLORS.background,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarItem: { paddingVertical: 0 },
  tabBarIcon: { height: 30, marginTop: 0, marginBottom: 2 },
  iconContainer: {
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarLabel: { fontSize: 12, lineHeight: 14, fontWeight: '500' },
  tabBarLabelActive: { fontWeight: '700' },
});
