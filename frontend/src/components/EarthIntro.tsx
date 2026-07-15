import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import Svg, { Circle, Path, Ellipse, Defs, RadialGradient, Stop, G } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { theme } from '../theme';

const { width: W, height: H } = Dimensions.get('window');
const SIZE = Math.min(240, W * 0.6);
const mono = Platform.OS === 'ios' ? 'Courier' : 'monospace';

/** Animated rotating Earth shown while the app boots. */
export default function EarthIntro({ onDone }: { onDone: () => void }) {
  const spin = useSharedValue(0);
  const ringSpin = useSharedValue(0);
  const fadeIn = useSharedValue(0);
  const fadeOut = useSharedValue(1);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 700 });
    spin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1);
    ringSpin.value = withRepeat(withTiming(-360, { duration: 9000, easing: Easing.linear }), -1);
    shimmer.value = withRepeat(withTiming(1, { duration: 1100 }), -1, true);
    // Hold, then fade the whole intro away.
    fadeOut.value = withDelay(
      2600,
      withSequence(
        withTiming(1, { duration: 1 }),
        withTiming(0, { duration: 600 }, (finished) => {
          if (finished) runOnJS(onDone)();
        })
      )
    );
  }, [spin, ringSpin, fadeIn, fadeOut, shimmer, onDone]);

  const planetStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringSpin.value}deg` }],
  }));
  const wrapStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value * fadeOut.value,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + shimmer.value * 0.65,
    width: `${20 + shimmer.value * 80}%`,
  }));

  const R = SIZE / 2;

  return (
    <Animated.View style={[styles.root, wrapStyle]} pointerEvents="none">
      {/* star field */}
      {STARS.map((s, i) => (
        <View
          key={i}
          style={[
            styles.star,
            { left: s[0] * W, top: s[1] * H, width: s[2], height: s[2], opacity: s[3] },
          ]}
        />
      ))}

      <View style={{ width: SIZE * 1.4, height: SIZE * 1.4, alignItems: 'center', justifyContent: 'center' }}>
        {/* orbital scan ring (counter-rotating) */}
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle, { alignItems: 'center', justifyContent: 'center' }]}>
          <Svg width={SIZE * 1.4} height={SIZE * 1.4}>
            <Circle
              cx={SIZE * 0.7}
              cy={SIZE * 0.7}
              r={R * 1.24}
              stroke={theme.colors.secondary}
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="4 10"
              fill="none"
            />
            <Circle cx={SIZE * 0.7 + R * 1.24} cy={SIZE * 0.7} r={3.5} fill={theme.colors.secondary} />
          </Svg>
        </Animated.View>

        {/* the planet */}
        <Animated.View style={planetStyle}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 200 200">
            <Defs>
              <RadialGradient id="ocean" cx="38%" cy="34%" r="75%">
                <Stop offset="0%" stopColor="#3aa0ff" />
                <Stop offset="55%" stopColor="#1565d8" />
                <Stop offset="100%" stopColor="#062a66" />
              </RadialGradient>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="80%" stopColor="#00e5ff" stopOpacity="0" />
                <Stop offset="100%" stopColor="#00e5ff" stopOpacity="0.35" />
              </RadialGradient>
            </Defs>
            <Circle cx="100" cy="100" r="97" fill="url(#glow)" />
            <Circle cx="100" cy="100" r="88" fill="url(#ocean)" />
            <G fill="#19c96a" fillOpacity={0.92}>
              {/* stylized continents */}
              <Path d="M70 38 q22 -10 38 -2 q14 6 10 20 q-4 12 -20 12 q-8 12 -22 8 q-16 -4 -14 -20 q1 -12 8 -18 z" />
              <Path d="M118 82 q16 -4 24 8 q8 14 -2 26 q-8 10 -8 22 q-1 12 -12 10 q-10 -2 -10 -14 q-1 -14 -6 -22 q-6 -12 2 -22 q5 -6 12 -8 z" />
              <Path d="M46 92 q12 -6 18 4 q5 10 -2 20 q-8 10 -6 22 q1 12 -9 10 q-9 -3 -10 -16 q-1 -12 1 -22 q2 -12 8 -18 z" />
              <Ellipse cx="142" cy="152" rx="13" ry="8" />
              <Ellipse cx="66" cy="160" rx="9" ry="5" />
            </G>
            {/* atmosphere highlight */}
            <Circle cx="100" cy="100" r="88" fill="none" stroke="#bfe9ff" strokeOpacity={0.25} strokeWidth={2} />
          </Svg>
        </Animated.View>
      </View>

      <Text style={styles.title}>EVOSNAP</Text>
      <Text style={styles.etymology}>EVOLUTION · IN EVERY SNAP</Text>
      <Text style={styles.tagline}>SCAN TODAY · SAVE TOMORROW</Text>

      <View style={styles.loaderTrack}>
        <Animated.View style={[styles.loaderFill, shimmerStyle]} />
      </View>
    </Animated.View>
  );
}

// [x%, y%, size, opacity]
const STARS: [number, number, number, number][] = [
  [0.1, 0.12, 2, 0.8], [0.85, 0.08, 1.5, 0.5], [0.25, 0.2, 1.5, 0.6],
  [0.7, 0.16, 2, 0.7], [0.92, 0.3, 1.5, 0.5], [0.08, 0.4, 2, 0.6],
  [0.18, 0.72, 1.5, 0.5], [0.88, 0.68, 2, 0.7], [0.6, 0.85, 1.5, 0.4],
  [0.3, 0.9, 2, 0.5], [0.5, 0.06, 1.5, 0.6], [0.78, 0.88, 1.5, 0.5],
];

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020409',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  star: { position: 'absolute', borderRadius: 2, backgroundColor: '#cfeaff' },
  title: {
    marginTop: 30,
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 10,
  },
  etymology: {
    marginTop: 8,
    color: theme.colors.secondary,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
  },
  tagline: {
    marginTop: 14,
    color: theme.colors.primary,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 4,
    fontWeight: '700',
  },
  loaderTrack: {
    marginTop: 28,
    width: 180,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  loaderFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
});
