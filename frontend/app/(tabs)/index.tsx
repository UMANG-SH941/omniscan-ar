import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Dimensions,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { scanImage } from '../../src/api';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const RETICLE = 300;

export default function ScannerScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const webInputRef = useRef<HTMLInputElement | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('READY');
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [hudActive, setHudActive] = useState(false);

  // Animations
  const scanLineY = useSharedValue(0);
  const pulse = useSharedValue(0.5);
  const cornerOpacity = useSharedValue(1);

  useFocusEffect(
    useCallback(() => {
      cornerOpacity.value = withTiming(1, { duration: 600 });
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      return () => {
        cancelAnimation(pulse);
        cancelAnimation(scanLineY);
      };
    }, [cornerOpacity, pulse, scanLineY])
  );

  useEffect(() => {
    if (busy) {
      scanLineY.value = 0;
      scanLineY.value = withRepeat(
        withTiming(RETICLE - 4, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(scanLineY);
      scanLineY.value = withTiming(0, { duration: 200 });
    }
  }, [busy, scanLineY]);

  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanLineY.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
  }));

  const cornersStyle = useAnimatedStyle(() => ({
    opacity: cornerOpacity.value,
  }));

  const onScan = async () => {
    if (busy) return;
    try {
      setBusy(true);
      setStatusText('CAPTURING...');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      let b64 = '';
      if (Platform.OS === 'web') {
        // trigger file input
        setBusy(false);
        setStatusText('SELECT IMAGE');
        webInputRef.current?.click();
        return;
      }

      if (!cameraRef.current) {
        setBusy(false);
        setStatusText('NO CAMERA');
        return;
      }

      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: 0.7,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        setBusy(false);
        setStatusText('CAPTURE FAILED');
        return;
      }
      // compress to 800px wide jpeg base64
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      b64 = manipulated.base64 || '';
      setPreviewB64(b64);

      setStatusText('ANALYZING...');
      setHudActive(true);
      const scan = await scanImage(b64);

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.push(`/scan/${scan.id}`);
      setTimeout(() => {
        setBusy(false);
        setPreviewB64(null);
        setHudActive(false);
        setStatusText('READY');
      }, 500);
    } catch (err: any) {
      console.error(err);
      setBusy(false);
      setPreviewB64(null);
      setHudActive(false);
      setStatusText('ERROR');
      Alert.alert('Scan failed', String(err?.message || err));
    }
  };

  const handleWebFile = async (file: File) => {
    try {
      setBusy(true);
      setStatusText('ANALYZING...');
      setHudActive(true);

      // Resize + compress via canvas to keep payload small
      const compress = (src: File): Promise<string> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new window.Image();
            img.onload = () => {
              const maxW = 800;
              const scale = Math.min(1, maxW / img.width);
              const w = Math.round(img.width * scale);
              const h = Math.round(img.height * scale);
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) return reject(new Error('no ctx'));
              ctx.drawImage(img, 0, 0, w, h);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              resolve(dataUrl.split(',')[1] || '');
            };
            img.onerror = () => reject(new Error('img load fail'));
            img.src = reader.result as string;
          };
          reader.onerror = () => reject(new Error('read fail'));
          reader.readAsDataURL(src);
        });

      const base64 = await compress(file);
      setPreviewB64(base64);
      const scan = await scanImage(base64);
      router.push(`/scan/${scan.id}`);
      setTimeout(() => {
        setBusy(false);
        setPreviewB64(null);
        setHudActive(false);
        setStatusText('READY');
      }, 400);
    } catch (e: any) {
      setBusy(false);
      setHudActive(false);
      setStatusText('ERROR');
      Alert.alert('Scan failed', String(e?.message || e));
    }
  };

  // Permission UI
  if (Platform.OS !== 'web' && !permission) {
    return (
      <View style={styles.permWrap}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (Platform.OS !== 'web' && !permission?.granted) {
    return (
      <SafeAreaView style={styles.permWrap} edges={['top', 'bottom']}>
        <View style={styles.permCard} testID="camera-permission-card">
          <View style={styles.permIconWrap}>
            <Ionicons name="scan-circle" size={68} color={theme.colors.primary} />
          </View>
          <Text style={styles.permTitle}>ENABLE SCANNER</Text>
          <Text style={styles.permBody}>
            OmniScan needs camera access to identify objects in real-time using AI vision.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => requestPermission()}
            testID="grant-camera-permission-btn">
            <Text style={styles.primaryBtnText}>GRANT ACCESS</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root} testID="scanner-screen">
      {/* CAMERA / PREVIEW LAYER */}
      {Platform.OS === 'web' ? (
        <View style={styles.webBg}>
          {previewB64 ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${previewB64}` }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : (
            <Image
              source={{
                uri: 'https://images.unsplash.com/photo-1687075196974-ea71a55cc9f8?crop=entropy&cs=srgb&fm=jpg&w=1600',
              }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          )}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />
          {/* hidden file input */}
          {Platform.OS === 'web' ? (
            // eslint-disable-next-line react/no-unknown-property
            <input
              // @ts-ignore
              ref={(el: HTMLInputElement | null) => { webInputRef.current = el; }}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' } as any}
              onChange={(e: any) => {
                const file = e?.target?.files?.[0];
                if (file) handleWebFile(file);
                if (e?.target) e.target.value = '';
              }}
            />
          ) : null}
        </View>
      ) : (
        <CameraView
          ref={(r) => { cameraRef.current = r; }}
          style={StyleSheet.absoluteFillObject}
          facing={facing}
        />
      )}

      {/* DARK VIGNETTE */}
      <View pointerEvents="none" style={styles.vignette} />

      {/* TOP HUD */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topHudWrap}>
        <View style={styles.topHud} testID="top-hud">
          <View style={styles.topHudLeft}>
            <View style={[styles.dot, { backgroundColor: theme.colors.primary }]} />
            <Text style={styles.hudLabel}>OMNISCAN · v1</Text>
          </View>
          <View style={styles.topHudRight}>
            <Text style={styles.hudStatus}>{statusText}</Text>
          </View>
        </View>
        <View style={styles.topMetaRow}>
          <Text style={styles.metaMono}>LAT 0.000 · LON 0.000</Text>
          <Text style={styles.metaMono}>MODE · AI-VISION</Text>
        </View>
      </SafeAreaView>

      {/* CENTER RETICLE */}
      <View pointerEvents="none" style={styles.reticleWrap}>
        <View style={styles.reticle} testID="scan-reticle">
          {/* corners */}
          <View style={[styles.corner, styles.cTL]} />
          <View style={[styles.corner, styles.cTR]} />
          <View style={[styles.corner, styles.cBL]} />
          <View style={[styles.corner, styles.cBR]} />

          {/* crosshair */}
          <View style={styles.crossH} />
          <View style={styles.crossV} />

          {/* static subtle border */}
          <View style={styles.reticleBorder} />

          {/* scanning line */}
          {busy && (
            <Animated.View style={[styles.scanLine, scanLineStyle]} testID="scan-line" />
          )}
        </View>

        <Text style={styles.reticleHint} testID="reticle-hint">
          {busy ? 'IDENTIFYING TARGET' : 'ALIGN OBJECT WITHIN FRAME'}
        </Text>
      </View>

      {/* BOTTOM CONTROLS */}
      <SafeAreaView edges={['bottom']} pointerEvents="box-none" style={styles.bottomWrap}>
        {/* confidence / tips pill row */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tipsRow}>
          {['PLANTS', 'PRODUCTS', 'LANDMARKS', 'OBJECTS', 'ANIMALS', 'FOOD'].map((t) => (
            <View key={t} style={styles.tipPill} testID={`supported-${t.toLowerCase()}`}>
              <Text style={styles.tipText}>{t}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.controlRow}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => router.push('/history')}
            testID="open-history-btn">
            <Ionicons name="time-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onScan}
            disabled={busy}
            style={styles.fabWrap}
            testID="scan-trigger-button">
            <View style={styles.fabOuter}>
              <View style={styles.fabInner}>
                {busy ? (
                  <ActivityIndicator color={theme.colors.bg} size="large" />
                ) : (
                  <Ionicons name="scan" size={36} color={theme.colors.bg} />
                )}
              </View>
            </View>
            <Text style={styles.fabLabel}>{busy ? 'SCANNING' : 'TAP TO SCAN'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => {
              if (Platform.OS === 'web') return;
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
            testID="flip-camera-btn">
            <Ionicons name="sync-outline" size={22} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {hudActive && (
          <View style={styles.analyzingBanner} testID="analyzing-banner">
            <View style={[styles.dot, { backgroundColor: theme.colors.secondary }]} />
            <Text style={styles.analyzingText}>
              NEURAL NET ACTIVE · GEMINI VISION PROCESSING
            </Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  webBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0a0a' },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 120,
  },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg, padding: 24 },
  permCard: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    maxWidth: 360,
  },
  permIconWrap: { marginBottom: 12 },
  permTitle: {
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    letterSpacing: 3,
    marginBottom: 8,
    fontWeight: '700',
  },
  permBody: { color: theme.colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  primaryBtnText: {
    color: theme.colors.bg,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 13,
  },

  topHudWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20 },
  topHud: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  topHudLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topHudRight: {},
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8, shadowColor: theme.colors.primary, shadowOpacity: 0.8, shadowRadius: 6 },
  hudLabel: {
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: '600',
  },
  hudStatus: {
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: '700',
  },
  topMetaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 6 },
  metaMono: {
    color: theme.colors.textDim,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    letterSpacing: 2,
  },

  reticleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reticle: { width: RETICLE, height: RETICLE, overflow: 'visible' },
  reticleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: theme.colors.primaryDim,
    borderRadius: 4,
  },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: theme.colors.primary },
  cTL: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3 },
  cTR: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3 },
  cBL: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3 },
  cBR: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3 },
  crossH: {
    position: 'absolute',
    top: RETICLE / 2 - 0.5,
    left: RETICLE / 2 - 14,
    width: 28,
    height: 1,
    backgroundColor: theme.colors.primary,
    opacity: 0.7,
  },
  crossV: {
    position: 'absolute',
    left: RETICLE / 2 - 0.5,
    top: RETICLE / 2 - 14,
    width: 1,
    height: 28,
    backgroundColor: theme.colors.primary,
    opacity: 0.7,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  reticleHint: {
    marginTop: 20,
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    letterSpacing: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },

  bottomWrap: { position: 'absolute', bottom: 80, left: 0, right: 0, paddingBottom: 12 },
  tipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 14 },
  tipPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(0,0,0,0.45)',
    marginRight: 8,
  },
  tipText: {
    color: theme.colors.textDim,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  sideBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: { alignItems: 'center' },
  fabOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,255,102,0.2)',
    borderWidth: 2,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  fabInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: {
    marginTop: 10,
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '700',
  },
  analyzingBanner: {
    marginTop: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,229,255,0.1)',
    borderWidth: 1,
    borderColor: theme.colors.secondaryDim,
  },
  analyzingText: {
    color: theme.colors.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    letterSpacing: 2,
  },
});
