import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme, CATEGORIES } from '../../src/theme';
import { listScans, lastListWasOffline, Scan } from '../../src/api';

export default function HistoryScreen() {
  return <HistoryView favoritesOnly={false} title="SCAN LOG" />;
}

export function HistoryView({
  favoritesOnly,
  title,
}: {
  favoritesOnly: boolean;
  title: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState('all');
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listScans(category, favoritesOnly);
      setScans(data);
      setOffline(lastListWasOffline);
    } catch (e) {
      console.log('listScans error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, favoritesOnly]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [category, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderItem = ({ item, index }: { item: Scan; index: number }) => {
    const isLarge = index % 5 === 0;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/scan/${item.id}`)}
        style={[styles.card, isLarge && styles.cardLarge]}
        testID={`scan-card-${item.id}`}>
        {item.image_base64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${item.image_base64}` }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : (
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0f0f0f' }]} />
        )}
        <View style={styles.cardOverlay} />
        <View style={styles.cardTopRow}>
          <View style={styles.catPill}>
            <Text style={styles.catPillText}>{item.category.toUpperCase()}</Text>
          </View>
          {item.favorite ? (
            <Ionicons name="star" size={14} color={theme.colors.primary} />
          ) : null}
        </View>
        <View style={styles.cardBottomRow}>
          <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.cardTag} numberOfLines={1}>{item.short_label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>DATABASE</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{scans.length} ENTRIES</Text>
        </View>
      </View>

      {offline && (
        <View style={styles.offlineBanner} testID="offline-banner">
          <Ionicons name="cloud-offline-outline" size={13} color="#FFD60A" />
          <Text style={styles.offlineText}>
            SERVER OFFLINE · SHOWING SCANS SAVED ON THIS PHONE
          </Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catsRow}
        style={styles.catsScroll}>
        {CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[styles.catChip, active && styles.catChipActive]}
              testID={`category-filter-${c.key}`}>
              <Ionicons
                name={c.icon}
                size={14}
                color={active ? theme.colors.bg : theme.colors.text}
              />
              <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={{color: theme.colors.textDim, marginTop: 16, fontSize: 11, letterSpacing: 2}}>
            LOADING DATABASE...
          </Text>
        </View>
      ) : scans.length === 0 ? (
        <View style={styles.centerWrap} testID="empty-state">
          <Ionicons
            name={favoritesOnly ? 'star-outline' : 'scan-outline'}
            size={48}
            color={theme.colors.textFaint}
          />
          <Text style={styles.emptyTitle}>
            {favoritesOnly ? 'NO FAVORITES YET' : 'NO SCANS YET'}
          </Text>
          <Text style={styles.emptyBody}>
            {favoritesOnly
              ? 'Star scans from the detail view to save them here.'
              : 'Head to the Scan tab and identify your first object.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/')}
            testID="goto-scanner-btn">
            <Text style={styles.primaryBtnText}>OPEN SCANNER</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={scans}
          numColumns={2}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={{ gap: 10 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,214,10,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,214,10,0.35)',
  },
  offlineText: {
    color: '#FFD60A',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '700',
    marginLeft: 8,
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    letterSpacing: 3,
    marginBottom: 4,
    fontWeight: '700',
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,255,102,0.12)',
    borderWidth: 1,
    borderColor: theme.colors.primaryDim,
  },
  countText: {
    color: theme.colors.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  catsScroll: { maxHeight: 50, flexGrow: 0 },
  catsRow: { paddingHorizontal: 16, gap: 8, paddingVertical: 6 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  catChipText: {
    color: theme.colors.text,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  catChipTextActive: { color: theme.colors.bg },

  listContent: { padding: 16, paddingBottom: 120, gap: 10 },
  card: {
    flex: 1,
    height: 170,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#0f0f0f',
    padding: 10,
    justifyContent: 'space-between',
  },
  cardLarge: { height: 200 },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBottomRow: { marginTop: 'auto' },
  catPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.primaryDim,
  },
  catPillText: {
    color: theme.colors.primary,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  cardName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 6,
  },
  cardTag: {
    color: theme.colors.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },

  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: {
    color: theme.colors.text,
    marginTop: 16,
    fontSize: 14,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  emptyBody: {
    color: theme.colors.textDim,
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 280,
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: theme.colors.bg,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 12,
  },
});
