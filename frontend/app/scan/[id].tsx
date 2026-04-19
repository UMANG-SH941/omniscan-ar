import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '../../src/theme';
import {
  chatAboutScan,
  deleteScan,
  getScan,
  Scan,
  toggleFavorite,
} from '../../src/api';

const { width: SCREEN_W } = Dimensions.get('window');

export default function ScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<'overview' | 'chat'>('overview');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!id || !hydrated) return;
    (async () => {
      try {
        const s = await getScan(id);
        setScan(s);
      } catch (e) {
        console.log('getScan error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, hydrated]);

  const onToggleFav = async () => {
    if (!scan) return;
    try {
      const updated = await toggleFavorite(scan.id);
      setScan(updated);
    } catch {
      /* ignore */
    }
  };

  const onDelete = () => {
    if (!scan) return;
    Alert.alert('Delete scan?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteScan(scan.id);
            router.back();
          } catch {
            Alert.alert('Error', 'Delete failed');
          }
        },
      },
    ]);
  };

  const sendMessage = async () => {
    if (!scan || !input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);
    try {
      const updated = await chatAboutScan(scan.id, msg);
      setScan(updated);
      setTimeout(() => chatRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert('Chat failed', String(e?.message || e));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!scan) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emptyTitle}>SCAN NOT FOUND</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/')}>
          <Text style={styles.primaryBtnText}>BACK TO SCANNER</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const suggestions = [
    'Tell me more details',
    'How do I care for it?',
    'What is its history?',
    'Similar items?',
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.colors.bg }}>
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.iconBtn}
            testID="back-btn">
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topLabel}>SCAN RESULT</Text>
            <Text style={styles.topCode}>ID · {scan.id.slice(0, 8).toUpperCase()}</Text>
          </View>
          <TouchableOpacity
            onPress={onToggleFav}
            style={styles.iconBtn}
            testID="toggle-favorite-btn">
            <Ionicons
              name={scan.favorite ? 'star' : 'star-outline'}
              size={22}
              color={scan.favorite ? theme.colors.primary : theme.colors.text}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={chatRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.heroWrap}>
          {scan.image_base64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${scan.image_base64}` }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0f0f0f' }]} />
          )}
          <View style={styles.heroOverlay} />
          {/* HUD corners */}
          <View style={[styles.heroCorner, styles.hcTL]} />
          <View style={[styles.heroCorner, styles.hcTR]} />
          <View style={[styles.heroCorner, styles.hcBL]} />
          <View style={[styles.heroCorner, styles.hcBR]} />

          {/* Floating AR tag */}
          <View
            style={styles.arTag}
            testID="ar-floating-tag">
            <View style={styles.arTagDot} />
            <Text style={styles.arTagText}>{scan.short_label.toUpperCase()}</Text>
          </View>

          {/* bottom label card */}
          <View style={styles.heroBottomRow}>
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>{scan.category.toUpperCase()}</Text>
            </View>
            <View style={styles.confBadge}>
              <Text style={styles.confText}>
                CONFIDENCE · {scan.confidence.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* Name */}
        <View style={styles.namePad}>
          <Text style={styles.nameText} testID="scan-name">
            {scan.name}
          </Text>
          <View style={styles.tagRow}>
            {scan.tags.map((t, i) => (
              <View key={`${t}-${i}`} style={styles.tagChip}>
                <Text style={styles.tagChipText}>#{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            onPress={() => setTab('overview')}
            style={[styles.tab, tab === 'overview' && styles.tabActive]}
            testID="tab-overview">
            <Text style={[styles.tabText, tab === 'overview' && styles.tabTextActive]}>
              OVERVIEW
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('chat')}
            style={[styles.tab, tab === 'chat' && styles.tabActive]}
            testID="tab-chat">
            <Text style={[styles.tabText, tab === 'chat' && styles.tabTextActive]}>
              ASK AI{scan.chat_history.length > 0 ? ` · ${Math.floor(scan.chat_history.length / 2)}` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {tab === 'overview' ? (
          <View style={styles.sectionWrap}>
            <SectionCard title="DESCRIPTION" body={scan.description} />
            <SectionCard title="USAGE · PURPOSE" body={scan.usage} />
            <View style={styles.insightsCard} testID="insights-card">
              <View style={styles.sectionHeader}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionTitle}>KEY INSIGHTS</Text>
              </View>
              {scan.insights.map((ins, i) => (
                <View key={i} style={styles.insightRow}>
                  <Text style={styles.insightNum}>0{i + 1}</Text>
                  <Text style={styles.insightText}>{ins}</Text>
                </View>
              ))}
              {scan.insights.length === 0 && (
                <Text style={styles.insightText}>No additional insights available.</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={onDelete}
              style={styles.deleteBtn}
              testID="delete-scan-btn">
              <Ionicons name="trash-outline" size={16} color={theme.colors.warning} />
              <Text style={styles.deleteText}>DELETE SCAN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.sectionWrap}>
            {scan.chat_history.length === 0 && (
              <View style={styles.chatIntro}>
                <Text style={styles.chatIntroTitle}>ASK ANYTHING ABOUT {scan.name.toUpperCase()}</Text>
                <Text style={styles.chatIntroBody}>
                  The AI has full context of your scan. Ask follow-up questions, history, care tips, comparisons, anything.
                </Text>
                <View style={styles.suggestRow}>
                  {suggestions.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestChip}
                      onPress={() => setInput(s)}
                      testID={`suggest-${s.replace(/\s+/g, '-').toLowerCase()}`}>
                      <Text style={styles.suggestText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            {scan.chat_history.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.msgBubble,
                  m.role === 'user' ? styles.msgUser : styles.msgAI,
                ]}
                testID={`chat-msg-${i}`}>
                {m.role === 'assistant' && (
                  <Text style={styles.msgLabel}>NEURAL · RESPONSE</Text>
                )}
                <Text
                  style={[
                    styles.msgText,
                    m.role === 'user' && { color: theme.colors.bg },
                  ]}>
                  {m.text}
                </Text>
              </View>
            ))}
            {sending && (
              <View style={[styles.msgBubble, styles.msgAI]}>
                <Text style={styles.msgLabel}>NEURAL · THINKING</Text>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {tab === 'chat' && (
        <SafeAreaView edges={['bottom']} style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about this object..."
              placeholderTextColor={theme.colors.textFaint}
              multiline
              testID="chat-input"
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!input.trim() || sending}
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && { opacity: 0.4 },
              ]}
              testID="chat-send-btn">
              {sending ? (
                <ActivityIndicator color={theme.colors.bg} />
              ) : (
                <Ionicons name="arrow-up" size={20} color={theme.colors.bg} />
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  );
}

function SectionCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionAccent} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.bodyText}>{body || 'No data available.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  topCenter: { flex: 1, alignItems: 'center' },
  topLabel: {
    color: theme.colors.primary,
    fontSize: 10,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  topCode: {
    color: theme.colors.textDim,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },

  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W * 0.85,
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  heroCorner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: theme.colors.primary,
  },
  hcTL: { top: 14, left: 14, borderTopWidth: 3, borderLeftWidth: 3 },
  hcTR: { top: 14, right: 14, borderTopWidth: 3, borderRightWidth: 3 },
  hcBL: { bottom: 14, left: 14, borderBottomWidth: 3, borderLeftWidth: 3 },
  hcBR: { bottom: 14, right: 14, borderBottomWidth: 3, borderRightWidth: 3 },

  arTag: {
    position: 'absolute',
    top: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
    shadowColor: theme.colors.secondary,
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  arTagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.secondary,
  },
  arTagText: {
    color: theme.colors.secondary,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    marginLeft: 4,
  },
  heroBottomRow: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  catBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.colors.primary,
    borderRadius: 4,
    marginRight: 8,
  },
  catBadgeText: {
    color: theme.colors.bg,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
  },
  confBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  confText: {
    color: theme.colors.text,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },

  namePad: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  nameText: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.secondaryDim,
    marginRight: 6,
    marginBottom: 6,
  },
  tagChipText: {
    color: theme.colors.secondary,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: theme.colors.primary },
  tabText: {
    fontSize: 11,
    letterSpacing: 2,
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  tabTextActive: { color: theme.colors.bg },

  sectionWrap: { paddingHorizontal: 20, gap: 12 },
  card: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  insightsCard: {
    backgroundColor: '#000',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.primaryDim,
    marginBottom: 12,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionAccent: {
    width: 3,
    height: 14,
    backgroundColor: theme.colors.primary,
    marginRight: 10,
  },
  sectionTitle: {
    color: theme.colors.primary,
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  bodyText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  insightRow: { flexDirection: 'row', paddingVertical: 8, gap: 14 },
  insightNum: {
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    width: 30,
  },
  insightText: { color: theme.colors.text, flex: 1, fontSize: 13, lineHeight: 20 },

  deleteBtn: {
    marginTop: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  deleteText: {
    color: theme.colors.warning,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginLeft: 6,
    fontWeight: '700',
  },

  chatIntro: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  chatIntroTitle: {
    color: theme.colors.primary,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    marginBottom: 8,
  },
  chatIntroBody: { color: theme.colors.textDim, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,255,102,0.08)',
    borderWidth: 1,
    borderColor: theme.colors.primaryDim,
    marginRight: 6,
    marginBottom: 6,
  },
  suggestText: { color: theme.colors.primary, fontSize: 12 },

  msgBubble: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    maxWidth: '88%',
  },
  msgUser: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
  },
  msgAI: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  msgLabel: {
    color: theme.colors.primary,
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    marginBottom: 6,
  },
  msgText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },

  inputBar: {
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    maxHeight: 120,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyTitle: {
    color: theme.colors.text,
    fontSize: 14,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 20,
    fontWeight: '700',
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
