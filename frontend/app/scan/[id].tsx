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
import { theme, FUTURE_STAGES } from '../../src/theme';
import {
  chatAboutScan,
  deleteScan,
  generateFuture,
  getScan,
  Scan,
  toggleFavorite,
} from '../../src/api';

const { width: SCREEN_W } = Dimensions.get('window');

type TabKey = 'overview' | 'impact' | 'future' | 'chat';

export default function ScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<TabKey>('overview');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [futureYears, setFutureYears] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [futureError, setFutureError] = useState<string | null>(null);
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

  const onSelectStage = async (years: number) => {
    setFutureYears(years);
    setFutureError(null);
    if (!scan || years === 0 || generating) return;
    if (scan.future_images?.[String(years)]) return; // cached
    setGenerating(true);
    try {
      const result = await generateFuture(scan.id, years);
      setScan((prev) =>
        prev
          ? {
              ...prev,
              future_images: {
                ...(prev.future_images || {}),
                [String(years)]: result.image_base64,
              },
            }
          : prev
      );
    } catch (e: any) {
      setFutureError(String(e?.message || e));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ color: '#00FF66', marginTop: 20, fontSize: 14 }}>
          LOADING SCAN {id?.slice(0, 8) || 'NO-ID'}
        </Text>
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
    'How do I dispose of it responsibly?',
    'What is its history?',
    'Similar items?',
  ];

  const futureImage =
    futureYears === 0
      ? scan.image_base64
      : scan.future_images?.[String(futureYears)] || null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'OVERVIEW' },
    { key: 'impact', label: 'IMPACT' },
    { key: 'future', label: 'FUTURE' },
    {
      key: 'chat',
      label: `ASK AI${scan.chat_history.length > 0 ? ` · ${Math.floor(scan.chat_history.length / 2)}` : ''}`,
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.colors.bg }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-btn">
            <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={styles.topCenter}>
            <Text style={styles.topLabel}>SCAN RESULT</Text>
            <Text style={styles.topCode}>ID · {scan.id.slice(0, 8).toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={onToggleFav} style={styles.iconBtn} testID="toggle-favorite-btn">
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
          <View style={[styles.heroCorner, styles.hcTL]} />
          <View style={[styles.heroCorner, styles.hcTR]} />
          <View style={[styles.heroCorner, styles.hcBL]} />
          <View style={[styles.heroCorner, styles.hcBR]} />

          <View style={styles.arTag} testID="ar-floating-tag">
            <View style={styles.arTagDot} />
            <Text style={styles.arTagText}>{scan.short_label.toUpperCase()}</Text>
          </View>

          <View style={styles.heroBottomRow}>
            <View style={styles.catBadge}>
              <Text style={styles.catBadgeText}>{scan.category.toUpperCase()}</Text>
            </View>
            <View style={styles.confBadge}>
              <Text style={styles.confText}>CONFIDENCE · {scan.confidence.toUpperCase()}</Text>
            </View>
            {scan.mode && scan.mode !== 'normal' ? (
              <View style={styles.confBadge}>
                <Text style={styles.confText}>LENS · {scan.mode.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Name */}
        <View style={styles.namePad}>
          <Text style={styles.nameText} testID="scan-name">
            {scan.name}
          </Text>
          {scan.material ? (
            <Text style={styles.materialLine}>
              <Text style={{ color: theme.colors.textDim }}>MATERIAL · </Text>
              {scan.material.toUpperCase()}
            </Text>
          ) : null}
          <View style={styles.tagRow}>
            {scan.tags.map((t, i) => (
              <View key={`${t}-${i}`} style={styles.tagChip}>
                <Text style={styles.tagChipText}>#{t}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              testID={`tab-${t.key}`}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tab === 'overview' && (
          <View style={styles.sectionWrap}>
            <SectionCard title="DESCRIPTION" body={scan.description} />
            <SectionCard title="USAGE · PURPOSE" body={scan.usage} />
            {scan.physical_properties ? (
              <SectionCard title="PHYSICAL PROPERTIES" body={scan.physical_properties} />
            ) : null}
            {scan.lifecycle ? <SectionCard title="LIFECYCLE" body={scan.lifecycle} /> : null}
            {scan.mode_focus ? (
              <SectionCard
                title={`${(scan.mode || 'lens').toUpperCase()} LENS`}
                body={scan.mode_focus}
                accent={theme.colors.secondary}
              />
            ) : null}
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
            <TouchableOpacity onPress={onDelete} style={styles.deleteBtn} testID="delete-scan-btn">
              <Ionicons name="trash-outline" size={16} color={theme.colors.warning} />
              <Text style={styles.deleteText}>DELETE SCAN</Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === 'impact' && (
          <View style={styles.sectionWrap}>
            {/* Score meters */}
            <View style={styles.metersCard} testID="impact-meters">
              <ScoreMeter
                label="SUSTAINABILITY"
                value={scan.sustainability_score}
                color={theme.colors.primary}
              />
              <ScoreMeter
                label="RECYCLABILITY"
                value={scan.recycling_score}
                color={theme.colors.secondary}
              />
              <View style={styles.statRow}>
                <View style={styles.statBlock}>
                  <Text style={styles.statLabel}>CARBON FOOTPRINT</Text>
                  <Text style={styles.statValue}>{scan.carbon_footprint || 'N/A'}</Text>
                </View>
                <View style={styles.statBlock}>
                  <Text style={styles.statLabel}>DECOMPOSITION</Text>
                  <Text style={styles.statValue}>{scan.decomposition_years || 'N/A'}</Text>
                </View>
              </View>
              {scan.recycling_category ? (
                <View style={[styles.statBlock, { marginTop: 12 }]}>
                  <Text style={styles.statLabel}>RECYCLING CATEGORY</Text>
                  <Text style={styles.statValue}>{scan.recycling_category}</Text>
                </View>
              ) : null}
            </View>

            {scan.explanation ? (
              <SectionCard title="AI EXPLANATION" body={scan.explanation} />
            ) : null}
            {scan.environmental_impact ? (
              <SectionCard title="ENVIRONMENTAL IMPACT" body={scan.environmental_impact} />
            ) : null}
            {scan.sustainability_advice ? (
              <SectionCard
                title="SUSTAINABILITY ADVICE"
                body={scan.sustainability_advice}
                accent={theme.colors.primary}
              />
            ) : null}

            {scan.decomposition_timeline?.length > 0 && (
              <View style={styles.card} testID="decomposition-timeline">
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.sectionTitle}>DECOMPOSITION TIMELINE</Text>
                </View>
                {scan.decomposition_timeline.map((stage, i) => (
                  <View key={i} style={styles.timelineRow}>
                    <View style={styles.timelineLeft}>
                      <View style={styles.timelineDot} />
                      {i < scan.decomposition_timeline.length - 1 && (
                        <View style={styles.timelineLine} />
                      )}
                    </View>
                    <View style={styles.timelineBody}>
                      <Text style={styles.timelineYears}>+{stage.years} YEARS</Text>
                      <Text style={styles.timelineState}>{stage.state}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {scan.sustainability_score < 0 && !scan.environmental_impact ? (
              <SectionCard
                title="NO IMPACT DATA"
                body="This scan was made before environmental analysis was added. Re-scan the object to generate impact data."
              />
            ) : null}
          </View>
        )}

        {tab === 'future' && (
          <View style={styles.sectionWrap}>
            {/* Stage selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.stageRow}>
              {FUTURE_STAGES.map((y) => {
                const active = futureYears === y;
                const has = y === 0 || !!scan.future_images?.[String(y)];
                return (
                  <TouchableOpacity
                    key={y}
                    onPress={() => onSelectStage(y)}
                    disabled={generating}
                    style={[styles.stageChip, active && styles.stageChipActive]}
                    testID={`future-stage-${y}`}>
                    <Text style={[styles.stageText, active && styles.stageTextActive]}>
                      {y === 0 ? 'NOW' : `+${y}Y`}
                    </Text>
                    {!has && !active && <View style={styles.stageDotPending} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Simulation viewport */}
            <View style={styles.futureViewport} testID="future-viewport">
              {futureImage ? (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${futureImage}` }}
                  style={StyleSheet.absoluteFillObject}
                  resizeMode="cover"
                />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, styles.futureEmpty]}>
                  {generating ? (
                    <>
                      <ActivityIndicator color={theme.colors.secondary} size="large" />
                      <Text style={styles.futureEmptyText}>
                        SIMULATING +{futureYears} YEARS OF DEGRADATION...
                      </Text>
                      <Text style={styles.futureEmptySub}>
                        AI image generation can take up to a minute
                      </Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="planet-outline" size={40} color={theme.colors.secondary} />
                      <Text style={styles.futureEmptyText}>
                        NO SIMULATION FOR +{futureYears}Y YET
                      </Text>
                      <TouchableOpacity
                        style={styles.generateBtn}
                        onPress={() => onSelectStage(futureYears)}
                        testID="generate-future-btn">
                        <Text style={styles.generateBtnText}>GENERATE</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
              <View style={styles.futureBadge}>
                <View style={[styles.dotSmall, { backgroundColor: theme.colors.secondary }]} />
                <Text style={styles.futureBadgeText}>
                  {futureYears === 0 ? 'PRESENT DAY' : `+${futureYears} YEARS · AI SIMULATION`}
                </Text>
              </View>
            </View>

            {futureError && (
              <View style={styles.errorCard} testID="future-error">
                <Ionicons name="warning-outline" size={16} color={theme.colors.warning} />
                <Text style={styles.errorText}>{futureError}</Text>
              </View>
            )}

            <SectionCard
              title="ABOUT FUTURE VISION"
              body={`The AI simulates how this ${scan.name.toLowerCase()} degrades in the environment over time, preserving its geometry and perspective. Each stage is generated once and cached.`}
              accent={theme.colors.secondary}
            />
          </View>
        )}

        {tab === 'chat' && (
          <View style={styles.sectionWrap}>
            {scan.chat_history.length === 0 && (
              <View style={styles.chatIntro}>
                <Text style={styles.chatIntroTitle}>
                  ASK ANYTHING ABOUT {scan.name.toUpperCase()}
                </Text>
                <Text style={styles.chatIntroBody}>
                  The AI has full context of your scan. Ask follow-up questions, history, care
                  tips, comparisons, anything.
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
                style={[styles.msgBubble, m.role === 'user' ? styles.msgUser : styles.msgAI]}
                testID={`chat-msg-${i}`}>
                {m.role === 'assistant' && <Text style={styles.msgLabel}>NEURAL · RESPONSE</Text>}
                <Text style={[styles.msgText, m.role === 'user' && { color: theme.colors.bg }]}>
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
              style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
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

function SectionCard({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent?: string;
}) {
  return (
    <View style={[styles.card, accent ? { borderColor: `${accent}44` } : null]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionAccent, accent ? { backgroundColor: accent } : null]} />
        <Text style={[styles.sectionTitle, accent ? { color: accent } : null]}>{title}</Text>
      </View>
      <Text style={styles.bodyText}>{body || 'No data available.'}</Text>
    </View>
  );
}

function ScoreMeter({ label, value, color }: { label: string; value: number; color: string }) {
  const known = value >= 0;
  return (
    <View style={styles.meterWrap}>
      <View style={styles.meterHeader}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterValue, { color }]}>{known ? `${value}/100` : 'N/A'}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${known ? value : 0}%`, backgroundColor: color, shadowColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const mono = Platform.OS === 'ios' ? 'Courier' : 'monospace';

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
    fontFamily: mono,
    fontWeight: '700',
  },
  topCode: {
    color: theme.colors.textDim,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: mono,
    marginTop: 2,
  },

  heroWrap: {
    width: SCREEN_W,
    height: SCREEN_W * 0.8,
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
  },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  heroCorner: { position: 'absolute', width: 36, height: 36, borderColor: theme.colors.primary },
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
  arTagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.secondary },
  arTagText: {
    color: theme.colors.secondary,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: mono,
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
    flexWrap: 'wrap',
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
    fontFamily: mono,
    fontWeight: '800',
  },
  confBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  confText: {
    color: theme.colors.text,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: mono,
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
  materialLine: {
    color: theme.colors.secondary,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: mono,
    marginTop: 6,
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
  tagChipText: { color: theme.colors.secondary, fontSize: 11, fontFamily: mono },

  tabsRow: {
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 6,
    marginBottom: 14,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 8,
  },
  tabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  tabText: {
    fontSize: 11,
    letterSpacing: 2,
    color: theme.colors.text,
    fontFamily: mono,
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
  sectionAccent: { width: 3, height: 14, backgroundColor: theme.colors.primary, marginRight: 10 },
  sectionTitle: {
    color: theme.colors.primary,
    fontSize: 11,
    letterSpacing: 3,
    fontFamily: mono,
    fontWeight: '700',
  },
  bodyText: { color: theme.colors.text, fontSize: 14, lineHeight: 22 },
  insightRow: { flexDirection: 'row', paddingVertical: 8, gap: 14 },
  insightNum: {
    color: theme.colors.primary,
    fontFamily: mono,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    width: 30,
  },
  insightText: { color: theme.colors.text, flex: 1, fontSize: 13, lineHeight: 20 },

  // Impact tab
  metersCard: {
    backgroundColor: '#000',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: theme.colors.primaryDim,
    marginBottom: 12,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 14,
  },
  meterWrap: { marginBottom: 16 },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  meterLabel: {
    color: theme.colors.textDim,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: mono,
    fontWeight: '700',
  },
  meterValue: { fontSize: 12, letterSpacing: 1, fontFamily: mono, fontWeight: '800' },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  meterFill: { height: 6, borderRadius: 3, shadowOpacity: 0.8, shadowRadius: 6 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statBlock: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginRight: 8,
  },
  statLabel: {
    color: theme.colors.textDim,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: mono,
    marginBottom: 6,
  },
  statValue: { color: theme.colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },

  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineLeft: { alignItems: 'center', width: 20 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
    marginTop: 3,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  timelineLine: { flex: 1, width: 1, backgroundColor: theme.colors.primaryDim, marginVertical: 2 },
  timelineBody: { flex: 1, paddingBottom: 16 },
  timelineYears: {
    color: theme.colors.primary,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: mono,
    fontWeight: '800',
    marginBottom: 3,
  },
  timelineState: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },

  // Future tab
  stageRow: { gap: 8, paddingBottom: 14 },
  stageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    marginRight: 8,
  },
  stageChipActive: { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary },
  stageText: {
    color: theme.colors.text,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: mono,
    fontWeight: '700',
  },
  stageTextActive: { color: theme.colors.bg },
  stageDotPending: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textFaint,
  },
  futureViewport: {
    width: SCREEN_W - 40,
    height: (SCREEN_W - 40) * 0.9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: theme.colors.secondaryDim,
    marginBottom: 12,
  },
  futureEmpty: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  futureEmptyText: {
    color: theme.colors.secondary,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: mono,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
  },
  futureEmptySub: { color: theme.colors.textDim, fontSize: 11, textAlign: 'center' },
  generateBtn: {
    marginTop: 8,
    backgroundColor: theme.colors.secondary,
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 999,
  },
  generateBtnText: {
    color: theme.colors.bg,
    fontFamily: mono,
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 11,
  },
  futureBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,10,14,0.8)',
    borderWidth: 1,
    borderColor: theme.colors.secondaryDim,
  },
  futureBadgeText: {
    color: theme.colors.secondary,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: mono,
    fontWeight: '700',
  },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: theme.colors.warning, fontSize: 12, flex: 1, lineHeight: 17 },

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
    fontFamily: mono,
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
    fontFamily: mono,
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

  msgBubble: { borderRadius: 14, padding: 14, marginBottom: 10, maxWidth: '88%' },
  msgUser: { alignSelf: 'flex-end', backgroundColor: theme.colors.primary },
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
    fontFamily: mono,
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
  input: { flex: 1, color: theme.colors.text, fontSize: 14, maxHeight: 120, paddingVertical: 8 },
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
    fontFamily: mono,
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
    fontFamily: mono,
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 12,
  },
});
