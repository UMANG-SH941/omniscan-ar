import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/theme';
import {
  AIR,
  CLIMATE_FACTS,
  EARTH_LAYERS,
  ERA_STATS,
  LAND,
  LEVERS,
  LEVER_STEPS,
  QUIZ,
  WATER,
  projectWarming,
  quizTitle,
  verdictFor,
} from '../../src/earthData';

const mono = Platform.OS === 'ios' ? 'Courier' : 'monospace';

const TONE_COLORS = {
  good: theme.colors.primary,
  warn: '#FFD60A',
  bad: theme.colors.warning,
} as const;

export default function EarthScreen() {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.headerPad}>
          <Text style={styles.eyebrow}>EVOSNAP · PLANET MODULE</Text>
          <Text style={styles.h1}>EARTH REPORT</Text>
          <Text style={styles.sub}>
            The state of our planet, where the current track leads — and how much of that is still a choice.
          </Text>
        </View>

        <FactCard />
        <FutureSimulator />
        <WaterCard />
        <AirLandCard title="THE AIR" icon="cloud-outline" stats={AIR.stats} accent={theme.colors.secondary} />
        <AirLandCard title="THE LAND" icon="earth-outline" stats={LAND.stats} accent={theme.colors.primary} />
        <LayersCard />
        <QuizCard />

        <Text style={styles.footnote}>
          Figures: IPCC AR6, WHO, UN-Water, FAO. The simulator is a simplified teaching model — the
          real climate is harder, and more worth saving.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */

function FactCard() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * CLIMATE_FACTS.length));
  const item = CLIMATE_FACTS[idx];
  return (
    <View style={[styles.card, { borderColor: theme.colors.secondaryDim }]} testID="climate-fact-card">
      <View style={styles.cardHeader}>
        <View style={[styles.accent, { backgroundColor: theme.colors.secondary }]} />
        <Text style={[styles.cardTitle, { color: theme.colors.secondary }]}>DID YOU KNOW?</Text>
        <TouchableOpacity
          onPress={() => setIdx((i) => (i + 1 + Math.floor(Math.random() * (CLIMATE_FACTS.length - 1))) % CLIMATE_FACTS.length)}
          style={styles.shuffleBtn}
          testID="shuffle-fact-btn">
          <Ionicons name="shuffle" size={14} color={theme.colors.secondary} />
          <Text style={styles.shuffleText}>NEXT</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.factText}>{item.fact}</Text>
      <View style={styles.futureStrip}>
        <Ionicons name="hourglass-outline" size={13} color={theme.colors.warning} />
        <Text style={styles.futureStripText}>IF WE STAY ON THIS TRACK — {item.future}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function FutureSimulator() {
  const [levels, setLevels] = useState<Record<string, number>>(
    () => Object.fromEntries(LEVERS.map((l) => [l.key, 0]))
  );
  const warming = useMemo(() => projectWarming(levels), [levels]);
  const verdict = verdictFor(warming);
  const tone = TONE_COLORS[verdict.tone];
  // 1.2 (best) .. 2.9 (worst) mapped to 100..0
  const health = Math.round(100 - ((warming - 1.2) / (2.9 - 1.2)) * 100);

  return (
    <View style={[styles.card, { borderColor: `${tone}55` }]} testID="future-simulator">
      <View style={styles.cardHeader}>
        <View style={[styles.accent, { backgroundColor: tone }]} />
        <Text style={[styles.cardTitle, { color: tone }]}>BEFORE · NOW · FUTURE</Text>
      </View>
      <Text style={styles.simHint}>
        The future column isn't fixed — it follows the effort you dial in below.
      </Text>

      {/* era table */}
      <View style={styles.eraHeaderRow}>
        <Text style={[styles.eraCell, styles.eraLabel]} />
        <Text style={[styles.eraCell, styles.eraHead]}>1850</Text>
        <Text style={[styles.eraCell, styles.eraHead]}>TODAY</Text>
        <Text style={[styles.eraCell, styles.eraHead, { color: tone }]}>2100</Text>
      </View>
      {ERA_STATS.map((s) => (
        <View key={s.key} style={styles.eraRow}>
          <Text style={[styles.eraCell, styles.eraLabel]}>{s.label}</Text>
          <Text style={styles.eraCell}>{s.before}</Text>
          <Text style={styles.eraCell}>{s.now}</Text>
          <Text style={[styles.eraCell, { color: tone, fontWeight: '800' }]}>{s.future(warming)}</Text>
        </View>
      ))}

      {/* planet health meter */}
      <View style={styles.healthWrap}>
        <View style={styles.healthHeader}>
          <Text style={styles.healthLabel}>PLANET HEALTH · 2100</Text>
          <Text style={[styles.healthValue, { color: tone }]}>{health}/100 · +{warming.toFixed(1)}°C</Text>
        </View>
        <View style={styles.healthTrack}>
          <View style={[styles.healthFill, { width: `${health}%`, backgroundColor: tone, shadowColor: tone }]} />
        </View>
      </View>

      {/* levers */}
      <Text style={styles.leverIntro}>PULL THE LEVERS · SAVE THE PLANET</Text>
      {LEVERS.map((lever) => {
        const level = levels[lever.key] ?? 0;
        return (
          <View key={lever.key} style={styles.leverBlock} testID={`lever-${lever.key}`}>
            <View style={styles.leverHead}>
              <Ionicons name={lever.icon as any} size={13} color={theme.colors.text} />
              <Text style={styles.leverLabel}>{lever.label}</Text>
              <Text style={styles.leverPct}>{Math.round((level / LEVER_STEPS) * 100)}%</Text>
            </View>
            <View style={styles.stepRow}>
              {Array.from({ length: LEVER_STEPS + 1 }, (_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setLevels((prev) => ({ ...prev, [lever.key]: i }))}
                  style={[
                    styles.step,
                    i <= level && level > 0 && { backgroundColor: tone, borderColor: tone },
                    i === 0 && level === 0 && { borderColor: theme.colors.borderStrong },
                  ]}
                  testID={`lever-${lever.key}-step-${i}`}
                />
              ))}
            </View>
            <Text style={styles.leverDesc}>{lever.description}</Text>
          </View>
        );
      })}

      <View style={[styles.verdict, { borderColor: `${tone}66`, backgroundColor: `${tone}14` }]}>
        <Text style={[styles.verdictTitle, { color: tone }]}>{verdict.title}</Text>
        <Text style={styles.verdictBody}>{verdict.body}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function WaterCard() {
  return (
    <View style={styles.card} testID="water-card">
      <View style={styles.cardHeader}>
        <View style={[styles.accent, { backgroundColor: '#3aa0ff' }]} />
        <Text style={[styles.cardTitle, { color: '#3aa0ff' }]}>THE WATER</Text>
      </View>

      {/* salt vs fresh stacked bar */}
      <View style={styles.stackBar}>
        {WATER.distribution.map((seg) => (
          <View key={seg.label} style={{ flex: seg.pct, backgroundColor: seg.color }} />
        ))}
      </View>
      <View style={styles.legendRow}>
        {WATER.distribution.map((seg) => (
          <View key={seg.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
            <Text style={styles.legendText}>
              {seg.label} · {seg.pct}%
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.subSection}>OF THAT TINY FRESH SHARE:</Text>
      {WATER.freshBreakdown.map((f) => (
        <View key={f.label} style={styles.miniBarRow}>
          <Text style={styles.miniBarLabel}>{f.label}</Text>
          <View style={styles.miniBarTrack}>
            <View style={[styles.miniBarFill, { width: `${f.pct}%`, backgroundColor: '#00E5FF' }]} />
          </View>
          <Text style={styles.miniBarPct}>{f.pct}%</Text>
        </View>
      ))}

      <StatGrid stats={WATER.stats} accent="#3aa0ff" />
    </View>
  );
}

function AirLandCard({
  title,
  icon,
  stats,
  accent,
}: {
  title: string;
  icon: string;
  stats: { value: string; label: string }[];
  accent: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.accent, { backgroundColor: accent }]} />
        <Text style={[styles.cardTitle, { color: accent }]}>{title}</Text>
        <Ionicons name={icon as any} size={14} color={accent} style={{ marginLeft: 'auto' }} />
      </View>
      <StatGrid stats={stats} accent={accent} />
    </View>
  );
}

function StatGrid({ stats, accent }: { stats: { value: string; label: string }[]; accent: string }) {
  return (
    <View style={styles.statGrid}>
      {stats.map((s) => (
        <View key={s.label} style={styles.statTile}>
          <Text style={[styles.statValue, { color: accent }]}>{s.value}</Text>
          <Text style={styles.statLabel}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function LayersCard() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={styles.card} testID="layers-card">
      <View style={styles.cardHeader}>
        <View style={[styles.accent, { backgroundColor: '#ff7043' }]} />
        <Text style={[styles.cardTitle, { color: '#ff7043' }]}>INSIDE THE EARTH</Text>
      </View>
      <Text style={styles.simHint}>Tap a layer — depth, temperature, and why it matters.</Text>
      {EARTH_LAYERS.map((layer, i) => {
        const active = open === layer.name;
        return (
          <TouchableOpacity
            key={layer.name}
            onPress={() => setOpen(active ? null : layer.name)}
            style={[
              styles.layerRow,
              { borderLeftColor: layer.color, marginLeft: i * 10 },
              active && { backgroundColor: `${layer.color}18` },
            ]}
            testID={`layer-${layer.name.toLowerCase().replace(' ', '-')}`}>
            <View style={styles.layerHead}>
              <Text style={[styles.layerName, { color: layer.color }]}>{layer.name}</Text>
              <Text style={styles.layerDepth}>{layer.depth}</Text>
            </View>
            {active && (
              <>
                <Text style={styles.layerTemp}>🌡 {layer.temp}</Text>
                <Text style={styles.layerNote}>{layer.note}</Text>
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */

function QuizCard() {
  const [qIdx, setQIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = QUIZ[qIdx];

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };

  const next = () => {
    if (qIdx + 1 >= QUIZ.length) {
      setDone(true);
    } else {
      setQIdx((i) => i + 1);
      setPicked(null);
    }
  };

  const restart = () => {
    setQIdx(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  return (
    <View style={[styles.card, { borderColor: theme.colors.primaryDim }]} testID="quiz-card">
      <View style={styles.cardHeader}>
        <View style={[styles.accent, { backgroundColor: theme.colors.primary }]} />
        <Text style={[styles.cardTitle, { color: theme.colors.primary }]}>ECO QUIZ</Text>
        {!done && (
          <Text style={styles.quizProgress}>
            {qIdx + 1}/{QUIZ.length}
          </Text>
        )}
      </View>

      {done ? (
        <View style={{ alignItems: 'center', paddingVertical: 10 }}>
          <Text style={styles.quizScore}>
            {score}/{QUIZ.length}
          </Text>
          <Text style={styles.quizRank}>{quizTitle(score, QUIZ.length)}</Text>
          <TouchableOpacity onPress={restart} style={styles.quizNextBtn} testID="quiz-restart-btn">
            <Text style={styles.quizNextText}>PLAY AGAIN</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.quizQ}>{q.q}</Text>
          {q.options.map((opt, i) => {
            const isAnswer = i === q.answer;
            const isPicked = picked === i;
            let border = theme.colors.border;
            let bg = 'transparent';
            if (picked !== null && isAnswer) {
              border = theme.colors.primary;
              bg = 'rgba(0,255,102,0.1)';
            } else if (isPicked && !isAnswer) {
              border = theme.colors.warning;
              bg = 'rgba(255,59,48,0.1)';
            }
            return (
              <TouchableOpacity
                key={i}
                onPress={() => pick(i)}
                style={[styles.quizOpt, { borderColor: border, backgroundColor: bg }]}
                testID={`quiz-opt-${i}`}>
                <Text style={styles.quizOptKey}>{String.fromCharCode(65 + i)}</Text>
                <Text style={styles.quizOptText}>{opt}</Text>
                {picked !== null && isAnswer && (
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
                )}
                {isPicked && !isAnswer && (
                  <Ionicons name="close-circle" size={16} color={theme.colors.warning} />
                )}
              </TouchableOpacity>
            );
          })}
          {picked !== null && (
            <>
              <Text style={styles.quizWhy}>{q.why}</Text>
              <TouchableOpacity onPress={next} style={styles.quizNextBtn} testID="quiz-next-btn">
                <Text style={styles.quizNextText}>
                  {qIdx + 1 >= QUIZ.length ? 'SEE RESULT' : 'NEXT QUESTION'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  headerPad: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  eyebrow: { color: theme.colors.primary, fontFamily: mono, fontSize: 10, letterSpacing: 3, fontWeight: '700' },
  h1: { color: theme.colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 },
  sub: { color: theme.colors.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 },

  card: {
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  accent: { width: 3, height: 14, marginRight: 10, backgroundColor: theme.colors.primary },
  cardTitle: { fontFamily: mono, fontSize: 11, letterSpacing: 3, fontWeight: '700', color: theme.colors.primary },

  shuffleBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.secondaryDim,
  },
  shuffleText: { color: theme.colors.secondary, fontFamily: mono, fontSize: 9, letterSpacing: 1.5, fontWeight: '700', marginLeft: 4 },
  factText: { color: theme.colors.text, fontSize: 14, lineHeight: 21 },
  futureStrip: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.25)',
    alignItems: 'flex-start',
  },
  futureStripText: { color: '#ffb4ae', fontSize: 12, lineHeight: 17, flex: 1, marginLeft: 6 },

  simHint: { color: theme.colors.textDim, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  eraHeaderRow: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  eraRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  eraCell: { flex: 1, color: theme.colors.text, fontSize: 11, fontFamily: mono, textAlign: 'center' },
  eraLabel: { flex: 1.4, textAlign: 'left', color: theme.colors.textDim },
  eraHead: { color: theme.colors.textDim, letterSpacing: 1, fontWeight: '700' },

  healthWrap: { marginTop: 14 },
  healthHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  healthLabel: { color: theme.colors.textDim, fontFamily: mono, fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  healthValue: { fontFamily: mono, fontSize: 11, letterSpacing: 1, fontWeight: '800' },
  healthTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  healthFill: { height: 8, borderRadius: 4, shadowOpacity: 0.8, shadowRadius: 8 },

  leverIntro: { color: theme.colors.text, fontFamily: mono, fontSize: 10, letterSpacing: 2.5, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  leverBlock: { marginBottom: 14 },
  leverHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  leverLabel: { color: theme.colors.text, fontFamily: mono, fontSize: 10, letterSpacing: 1.5, fontWeight: '700', marginLeft: 8 },
  leverPct: { marginLeft: 'auto', color: theme.colors.textDim, fontFamily: mono, fontSize: 10 },
  stepRow: { flexDirection: 'row', gap: 6 },
  step: {
    flex: 1,
    height: 16,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: 6,
  },
  leverDesc: { color: theme.colors.textFaint, fontSize: 11, marginTop: 6 },

  verdict: { marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 14 },
  verdictTitle: { fontFamily: mono, fontSize: 12, letterSpacing: 2, fontWeight: '800', marginBottom: 6 },
  verdictBody: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },

  stackBar: { flexDirection: 'row', height: 18, borderRadius: 6, overflow: 'hidden', marginBottom: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 12 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendText: { color: theme.colors.textDim, fontSize: 11 },
  subSection: { color: theme.colors.textDim, fontFamily: mono, fontSize: 9, letterSpacing: 2, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  miniBarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  miniBarLabel: { color: theme.colors.text, fontSize: 11, width: 130 },
  miniBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginHorizontal: 8 },
  miniBarFill: { height: 6, borderRadius: 3 },
  miniBarPct: { color: theme.colors.textDim, fontFamily: mono, fontSize: 10, width: 44, textAlign: 'right' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginHorizontal: -4 },
  statTile: {
    width: '46%',
    margin: '2%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    padding: 12,
  },
  statValue: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  statLabel: { color: theme.colors.textDim, fontSize: 11, lineHeight: 15 },

  layerRow: {
    borderLeftWidth: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    marginBottom: 8,
  },
  layerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  layerName: { fontFamily: mono, fontSize: 12, letterSpacing: 2, fontWeight: '800' },
  layerDepth: { color: theme.colors.textDim, fontFamily: mono, fontSize: 10 },
  layerTemp: { color: theme.colors.text, fontSize: 12, marginTop: 8, fontWeight: '700' },
  layerNote: { color: theme.colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 4 },

  quizProgress: { marginLeft: 'auto', color: theme.colors.textDim, fontFamily: mono, fontSize: 10, letterSpacing: 1 },
  quizQ: { color: theme.colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700', marginBottom: 12 },
  quizOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  quizOptKey: { color: theme.colors.textDim, fontFamily: mono, fontSize: 11, fontWeight: '800', width: 16 },
  quizOptText: { color: theme.colors.text, fontSize: 13, flex: 1, marginLeft: 6 },
  quizWhy: { color: theme.colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 6, fontStyle: 'italic' },
  quizNextBtn: {
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
  },
  quizNextText: { color: theme.colors.bg, fontFamily: mono, fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  quizScore: { color: theme.colors.text, fontSize: 40, fontWeight: '800' },
  quizRank: { color: theme.colors.primary, fontFamily: mono, fontSize: 13, letterSpacing: 3, fontWeight: '800', marginTop: 6 },

  footnote: {
    color: theme.colors.textFaint,
    fontSize: 10,
    lineHeight: 15,
    marginHorizontal: 24,
    marginTop: 18,
    textAlign: 'center',
  },
});
