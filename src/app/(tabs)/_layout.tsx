import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';
import { type ColorValue, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';

const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  inactive: '#766A68',
  border: '#F0E2DC',
};

const TAB_BAR_HEIGHT = 68;
const TAB_BAR_GAP = 6;

type TabIconProps = {
  color: ColorValue;
  focused: boolean;
  name: 'home' | 'directions-run' | 'stars' | 'monitor-heart' | 'person';
};

function TabIcon({ color, focused, name }: TabIconProps) {
  return (
    <View style={styles.iconContainer}>
      {focused && <View style={styles.activeIndicator} />}
      <MaterialIcons name={name} color={color} size={22} />
    </View>
  );
}

type CommunityTabIconProps = {
  color: ColorValue;
  focused: boolean;
  name: 'list-box-outline' | 'progress-star-four-points';
};

function CommunityTabIcon({ color, focused, name }: CommunityTabIconProps) {
  return (
    <View style={styles.iconContainer}>
      {focused && <View style={styles.activeIndicator} />}
      <MaterialCommunityIcons name={name} color={color} size={22} />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);
  const tabBarBottom = bottomInset + TAB_BAR_GAP;
  const contentBottomClearance = TAB_BAR_HEIGHT + tabBarBottom + 8;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.brand,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarButton: HapticTab,
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
            height: TAB_BAR_HEIGHT,
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
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    paddingTop: 5,
    paddingBottom: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.background,
    elevation: 10,
    shadowColor: '#6E514C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  tabBarItem: { height: 58, paddingVertical: 3, borderRadius: 18 },
  tabBarIcon: { marginTop: 1, marginBottom: 0 },
  iconContainer: {
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: COLORS.brand,
  },
  tabBarLabel: { fontSize: 12, fontWeight: '500' },
  tabBarLabelActive: { fontWeight: '700' },
});
