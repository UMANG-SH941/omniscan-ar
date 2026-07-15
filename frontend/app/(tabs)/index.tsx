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
  Modal,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { BlurView } from 'expo-blur';
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
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, SCAN_MODES } from '../../src/theme';
import { scanImage, detectObjects } from '../../src/api';
import { Track, updateTracks, mapBoxToScreen } from '../../src/tracking';
import Constants from 'expo-constants';
import { getBackendUrl, setBackendUrl, defaultBackendUrl, pingBackend } from '../../src/config';

const APP_VERSION = Constants.expoConfig?.version ?? '?';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Scale the reticle to the screen so it never collides with the HUD controls.
const RETICLE = Math.min(250, Math.round(SCREEN_W * 0.62));
const LIVE_FRAME_WIDTH = 512; // downscaled frame sent to the detector
const LIVE_LOOP_PAUSE_MS = 350; // breather between detection cycles

export default function ScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const webInputRef = useRef<HTMLInputElement | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState('READY');
  const [previewB64, setPreviewB64] = useState<string | null>(null);
  const [hudActive, setHudActive] = useState(false);
  const [mode, setMode] = useState('normal');

  // Server settings sheet
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [serverStatus, setServerStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [serverDetail, setServerDetail] = useState('');

  // Live AR state
  const [liveMode, setLiveMode] = useState(Platform.OS !== 'web');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [frameDims, setFrameDims] = useState({ w: LIVE_FRAME_WIDTH, h: LIVE_FRAME_WIDTH });
  const tracksRef = useRef<Track[]>([]);
  const busyRef = useRef(false);
  const liveRef = useRef(liveMode);
  const focusedRef = useRef(false);
  liveRef.current = liveMode;
  busyRef.current = busy;

  // Animations
  const scanLineY = useSharedValue(0);
  const pulse = useSharedValue(0.5);
  const cornerOpacity = useSharedValue(1);

  const captureLiveFrame = useCallback(async (): Promise<{
    b64: string;
    w: number;
    h: number;
  } | null> => {
    if (!cameraRef.current) return null;
    const photo = await cameraRef.current.takePictureAsync({
      base64: false,
      quality: 0.3,
      skipProcessing: true,
    });
    if (!photo?.uri) return null;
    const small = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ resize: { width: LIVE_FRAME_WIDTH } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!small.base64) return null;
    return { b64: small.base64, w: small.width, h: small.height };
  }, []);

  // Self-scheduling live detection loop.
  const runLiveLoop = useCallback(async () => {
    let failures = 0;
    while (focusedRef.current && liveRef.current && Platform.OS !== 'web') {
      if (busyRef.current) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      try {
        const frame = await captureLiveFrame();
        if (!frame || !focusedRef.current || !liveRef.current || busyRef.current) {
          await new Promise((r) => setTimeout(r, LIVE_LOOP_PAUSE_MS));
          continue;
        }
        const { objects } = await detectObjects(frame.b64);
        if (!focusedRef.current || !liveRef.current || busyRef.current) break;
        failures = 0;
        const updated = updateTracks(tracksRef.current, objects);
        tracksRef.current = updated;
        setTracks(updated);
        setFrameDims({ w: frame.w, h: frame.h });
        setStatusText(
          updated.length > 0 ? `LIVE · ${updated.length} TRACKED` : 'LIVE · SEARCHING'
        );
      } catch {
        // Backend hiccup or capture race: keep the loop alive but tell the
        // user where to look once it clearly isn't transient.
        failures += 1;
        if (focusedRef.current && liveRef.current) {
          setStatusText(failures >= 3 ? 'CHECK SERVER · TAP ⚙' : 'LIVE · RECONNECTING');
        }
        // Back off while the server is unreachable so we don't drain battery.
        if (failures >= 3) await new Promise((r) => setTimeout(r, 2500));
      }
      await new Promise((r) => setTimeout(r, LIVE_LOOP_PAUSE_MS));
    }
  }, [captureLiveFrame]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      cornerOpacity.value = withTiming(1, { duration: 600 });
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      if (liveRef.current && permission?.granted) {
        // Give the camera a moment to warm up before the first capture.
        const t = setTimeout(() => runLiveLoop(), 700);
        return () => {
          clearTimeout(t);
          focusedRef.current = false;
          cancelAnimation(pulse);
          cancelAnimation(scanLineY);
        };
      }
      return () => {
        focusedRef.current = false;
        cancelAnimation(pulse);
        cancelAnimation(scanLineY);
      };
    }, [cornerOpacity, pulse, scanLineY, runLiveLoop, permission?.granted])
  );

  const openSettings = async () => {
    setServerUrl(await getBackendUrl());
    setServerStatus('idle');
    setSettingsOpen(true);
  };

  const testServer = async () => {
    setServerStatus('testing');
    setServerDetail('');
    const result = await pingBackend(serverUrl);
    setServerStatus(result.ok ? 'ok' : 'fail');
    setServerDetail(result.detail);
  };

  const saveServer = async () => {
    await setBackendUrl(serverUrl);
    setSettingsOpen(false);
  };

  const toggleLive = () => {
    setTracks([]);
    tracksRef.current = [];
    const next = !liveMode;
    setLiveMode(next);
    liveRef.current = next;
    setStatusText(next ? 'LIVE · SEARCHING' : 'READY');
    if (next && focusedRef.current) runLiveLoop();
  };

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

  const onScan = async () => {
    if (busy) return;
    try {
      setBusy(true);
      busyRef.current = true;
      setStatusText('CAPTURING...');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      if (Platform.OS === 'web') {
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
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const b64 = manipulated.base64 || '';
      setPreviewB64(b64);

      setStatusText('ANALYZING...');
      setHudActive(true);
      const scan = await scanImage(b64, mode);

      // web already returned above; we're on a native platform here
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/scan/${scan.id}`);
      setTimeout(() => {
        setBusy(false);
        setPreviewB64(null);
        setHudActive(false);
        setStatusText(liveRef.current ? 'LIVE · SEARCHING' : 'READY');
      }, 500);
    } catch (err: any) {
      console.error(err);
      setBusy(false);
      setPreviewB64(null);
      setHudActive(false);
      setStatusText('ERROR');
      const msg = String(err?.message || err);
      if (/network request failed|failed to fetch|timed? ?out/i.test(msg)) {
        Alert.alert(
          'Cannot reach server',
          `${msg}\n\nCheck that the EvoSnap server is running and the URL in settings is correct.`,
          [
            { text: 'Server settings', onPress: openSettings },
            { text: 'OK', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Scan failed', msg);
      }
    }
  };

  const handleWebFile = async (file: File) => {
    try {
      setBusy(true);
      setStatusText('ANALYZING...');
      setHudActive(true);

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
      const scan = await scanImage(base64, mode);
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
            EvoSnap needs camera access to identify objects in real-time using AI vision.
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

  const showLiveOverlays = liveMode && !busy && Platform.OS !== 'web';

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
          enableTorch={torch}
          animateShutter={false}
        />
      )}

      {/* LIVE AR OVERLAYS — tap a box for a holographic detail popup */}
      {showLiveOverlays &&
        tracks.map((t) => {
          const r = mapBoxToScreen(t, frameDims.w, frameDims.h, SCREEN_W, SCREEN_H);
          if (r.w < 8 || r.h < 8) return null;
          const selected = selectedTrackId === t.id;
          return (
            <Animated.View
              key={t.id}
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(200)}
              style={[
                styles.arBox,
                { left: r.x, top: r.y, width: r.w, height: r.h },
                selected && { borderColor: theme.colors.primary },
              ]}
              testID={`ar-track-${t.id}`}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={StyleSheet.absoluteFill}
                onPress={() => setSelectedTrackId(selected ? null : t.id)}
                testID={`ar-track-tap-${t.id}`}
              />
              {/* corner ticks */}
              <View style={[styles.arCorner, styles.arTL]} pointerEvents="none" />
              <View style={[styles.arCorner, styles.arTR]} pointerEvents="none" />
              <View style={[styles.arCorner, styles.arBL]} pointerEvents="none" />
              <View style={[styles.arCorner, styles.arBR]} pointerEvents="none" />
              {/* connector + holographic label (never covers the object) */}
              <View style={styles.arConnector} pointerEvents="none" />
              <View style={styles.arLabel} pointerEvents="none">
                <View style={styles.arLabelDot} />
                <Text style={styles.arLabelText} numberOfLines={1}>
                  {t.label.toUpperCase()}
                </Text>
                <Text style={styles.arLabelConf}>{Math.round(t.confidence * 100)}%</Text>
              </View>
              {/* confidence bar */}
              <View style={styles.arConfTrack} pointerEvents="none">
                <View
                  style={[styles.arConfFill, { width: `${Math.round(t.confidence * 100)}%` }]}
                />
              </View>
            </Animated.View>
          );
        })}

      {/* TRANSLUCENT AR DETAIL POPUP anchored to the selected track */}
      {showLiveOverlays &&
        (() => {
          const t = tracks.find((x) => x.id === selectedTrackId);
          if (!t) return null;
          const r = mapBoxToScreen(t, frameDims.w, frameDims.h, SCREEN_W, SCREEN_H);
          const popW = 240;
          const left = Math.min(Math.max(r.x, 12), SCREEN_W - popW - 12);
          const below = r.y + r.h + 14;
          const top = below + 150 < SCREEN_H - 220 ? below : Math.max(60, r.y - 160);
          return (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={[styles.arPopupWrap, { left, top, width: popW }]}
              testID="ar-popup">
              <BlurView intensity={35} tint="dark" style={styles.arPopup}>
                <View style={styles.arPopupHeader}>
                  <View style={[styles.dot, { backgroundColor: theme.colors.secondary }]} />
                  <Text style={styles.arPopupTitle} numberOfLines={1}>
                    {t.label.toUpperCase()}
                  </Text>
                  <TouchableOpacity onPress={() => setSelectedTrackId(null)} hitSlop={10}>
                    <Ionicons name="close" size={15} color={theme.colors.textDim} />
                  </TouchableOpacity>
                </View>
                <View style={styles.arPopupRow}>
                  <Text style={styles.arPopupKey}>CONFIDENCE</Text>
                  <View style={styles.arPopupMeter}>
                    <View
                      style={[styles.arPopupMeterFill, { width: `${Math.round(t.confidence * 100)}%` }]}
                    />
                  </View>
                  <Text style={styles.arPopupVal}>{Math.round(t.confidence * 100)}%</Text>
                </View>
                <View style={styles.arPopupRow}>
                  <Text style={styles.arPopupKey}>TRACK ID</Text>
                  <Text style={styles.arPopupVal}>#{String(t.id).padStart(3, '0')} · {t.age} FRAMES</Text>
                </View>
                <TouchableOpacity
                  style={styles.arPopupBtn}
                  onPress={() => {
                    setSelectedTrackId(null);
                    onScan();
                  }}
                  testID="ar-popup-deep-scan">
                  <Ionicons name="scan" size={13} color={theme.colors.bg} />
                  <Text style={styles.arPopupBtnText}>DEEP SCAN THIS</Text>
                </TouchableOpacity>
              </BlurView>
            </Animated.View>
          );
        })()}

      {/* TOP HUD */}
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.topHudWrap}>
        <View style={styles.topHud} testID="top-hud">
          <View style={styles.topHudLeft}>
            <View
              style={[
                styles.dot,
                { backgroundColor: liveMode ? theme.colors.secondary : theme.colors.primary },
              ]}
            />
            <Text style={styles.hudLabel}>EVOSNAP</Text>
          </View>
          <View style={styles.topHudRightRow}>
            <Text style={styles.hudStatus} numberOfLines={1} ellipsizeMode="tail">
              {statusText}
            </Text>
            <TouchableOpacity onPress={openSettings} testID="open-settings-btn" hitSlop={10}>
              <Ionicons name="settings-outline" size={16} color={theme.colors.textDim} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.topMetaRow}>
          <Text style={styles.metaMono}>MODE · {mode.toUpperCase()}</Text>
          {Platform.OS !== 'web' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setTorch((t) => !t)}
                style={[styles.livePill, torch && { borderColor: theme.colors.primary }]}
                testID="torch-toggle">
                <Ionicons
                  name={torch ? 'flash' : 'flash-outline'}
                  size={12}
                  color={torch ? theme.colors.primary : theme.colors.textDim}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={toggleLive} style={styles.livePill} testID="live-toggle">
                <View
                  style={[
                    styles.dot,
                    {
                      marginRight: 4,
                      backgroundColor: liveMode ? theme.colors.secondary : theme.colors.textFaint,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.metaMono,
                    liveMode && { color: theme.colors.secondary },
                  ]}>
                  LIVE AR {liveMode ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* CENTER RETICLE (hidden while live overlays are tracking) */}
      {(!showLiveOverlays || tracks.length === 0) && (
        <View pointerEvents="none" style={styles.reticleWrap}>
          <View style={styles.reticle} testID="scan-reticle">
            <View style={[styles.corner, styles.cTL]} />
            <View style={[styles.corner, styles.cTR]} />
            <View style={[styles.corner, styles.cBL]} />
            <View style={[styles.corner, styles.cBR]} />
            <View style={styles.crossH} />
            <View style={styles.crossV} />
            <View style={styles.reticleBorder} />
            {busy && (
              <Animated.View style={[styles.scanLine, scanLineStyle]} testID="scan-line" />
            )}
          </View>
          <Text style={styles.reticleHint} testID="reticle-hint">
            {busy
              ? 'IDENTIFYING TARGET'
              : liveMode && Platform.OS !== 'web'
                ? 'SCANNING ENVIRONMENT...'
                : 'ALIGN OBJECT WITHIN FRAME'}
          </Text>
        </View>
      )}

      {/* BOTTOM CONTROLS — anchored above the tab bar, nav-bar aware */}
      <View
        pointerEvents="box-none"
        style={[styles.bottomWrap, { bottom: 58 + Math.max(insets.bottom, 10) + 8 }]}>
        {/* visualization mode selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tipsRow}>
          {SCAN_MODES.map((m) => {
            const active = mode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[styles.tipPill, active && styles.tipPillActive]}
                testID={`mode-${m.key}`}>
                <Ionicons
                  name={m.icon}
                  size={12}
                  color={active ? theme.colors.bg : theme.colors.textDim}
                />
                <Text style={[styles.tipText, active && styles.tipTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
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
            <Text style={styles.fabLabel}>{busy ? 'SCANNING' : 'DEEP SCAN'}</Text>
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
              NEURAL NET ACTIVE · VISION + KNOWLEDGE PIPELINE
            </Text>
          </View>
        )}
      </View>

      {/* SERVER SETTINGS SHEET */}
      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}>
        <View style={styles.settingsBackdrop}>
          <View style={styles.settingsCard} testID="settings-sheet">
            <View style={styles.settingsHeader}>
              <Ionicons name="server-outline" size={16} color={theme.colors.primary} />
              <Text style={styles.settingsTitle}>EVOSNAP SERVER</Text>
              <Text style={styles.settingsVersion}>APP v{APP_VERSION}</Text>
            </View>
            <Text style={styles.settingsHint}>
              URL of the EvoSnap backend this app connects to. http:// is added
              automatically if you leave it out.
            </Text>
            <TextInput
              style={styles.settingsInput}
              value={serverUrl}
              onChangeText={(t) => {
                setServerUrl(t);
                setServerStatus('idle');
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={defaultBackendUrl() || 'http://192.168.1.5:8001'}
              placeholderTextColor={theme.colors.textFaint}
              testID="server-url-input"
            />
            {serverStatus !== 'idle' && (
              <Text
                style={[
                  styles.settingsStatus,
                  serverStatus === 'ok' && { color: theme.colors.primary },
                  serverStatus === 'fail' && { color: theme.colors.warning },
                ]}
                testID="server-status">
                {serverStatus === 'testing'
                  ? 'TESTING CONNECTION...'
                  : serverStatus === 'ok'
                    ? `CONNECTED · ${serverDetail.toUpperCase()}`
                    : `FAILED · ${serverDetail}`}
              </Text>
            )}
            {serverStatus === 'fail' && (
              <Text style={styles.settingsHelp}>
                Same Wi-Fi as the server? If the URL opens in your phone browser
                but fails here, check phone settings → Apps → EvoSnap → allow
                Wi-Fi / background data (common on Oppo, Realme, OnePlus, Vivo).
              </Text>
            )}
            <View style={styles.settingsBtnRow}>
              <TouchableOpacity
                style={styles.settingsBtnGhost}
                onPress={testServer}
                disabled={serverStatus === 'testing'}
                testID="test-server-btn">
                <Text style={styles.settingsBtnGhostText}>TEST</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsBtnGhost}
                onPress={() => setSettingsOpen(false)}
                testID="cancel-settings-btn">
                <Text style={styles.settingsBtnGhostText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.settingsBtnSave}
                onPress={saveServer}
                testID="save-settings-btn">
                <Text style={styles.settingsBtnSaveText}>SAVE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const mono = Platform.OS === 'ios' ? 'Courier' : 'monospace';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  webBg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0a0a0a' },
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
    fontFamily: mono,
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
    fontFamily: mono,
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 13,
  },

  // Live AR overlay
  arBox: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.55)',
    borderRadius: 6,
  },
  arCorner: { position: 'absolute', width: 14, height: 14, borderColor: theme.colors.secondary },
  arTL: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  arTR: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  arBL: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  arBR: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  arConnector: {
    position: 'absolute',
    top: -14,
    left: 14,
    width: 1,
    height: 14,
    backgroundColor: theme.colors.secondary,
    opacity: 0.8,
  },
  arLabel: {
    position: 'absolute',
    top: -38,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,10,14,0.82)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.5)',
    maxWidth: 220,
  },
  arLabelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.secondary,
  },
  arLabelText: {
    color: theme.colors.secondary,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  arLabelConf: {
    color: theme.colors.textDim,
    fontFamily: mono,
    fontSize: 9,
    letterSpacing: 1,
  },
  arConfTrack: {
    position: 'absolute',
    bottom: -8,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 1,
  },
  arConfFill: {
    height: 2,
    backgroundColor: theme.colors.secondary,
    borderRadius: 1,
  },

  // AR detail popup
  arPopupWrap: {
    position: 'absolute',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.45)',
    shadowColor: theme.colors.secondary,
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  arPopup: { padding: 14, backgroundColor: 'rgba(4,12,16,0.55)' },
  arPopupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  arPopupTitle: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  arPopupRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  arPopupKey: {
    color: theme.colors.textDim,
    fontFamily: mono,
    fontSize: 8.5,
    letterSpacing: 1.5,
    width: 74,
  },
  arPopupMeter: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginRight: 8,
  },
  arPopupMeterFill: { height: 4, borderRadius: 2, backgroundColor: theme.colors.secondary },
  arPopupVal: {
    color: theme.colors.secondary,
    fontFamily: mono,
    fontSize: 9.5,
    letterSpacing: 1,
    fontWeight: '700',
  },
  arPopupBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
    paddingVertical: 9,
  },
  arPopupBtnText: {
    color: theme.colors.bg,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '800',
    marginLeft: 6,
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
  topHudLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  topHudRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    marginLeft: 10,
  },

  settingsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  settingsCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0a0a0a',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: 20,
  },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  settingsVersion: {
    marginLeft: 'auto',
    color: theme.colors.textFaint,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 9,
    letterSpacing: 1.5,
  },
  settingsTitle: {
    color: theme.colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    letterSpacing: 3,
    fontWeight: '700',
    marginLeft: 8,
  },
  settingsHint: { color: theme.colors.textDim, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  settingsInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  settingsStatus: {
    marginTop: 10,
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: theme.colors.textDim,
    fontWeight: '700',
  },
  settingsHelp: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.textDim,
  },
  settingsBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  settingsBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: 8,
  },
  settingsBtnGhostText: {
    color: theme.colors.text,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  settingsBtnSave: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    marginLeft: 8,
  },
  settingsBtnSaveText: {
    color: theme.colors.bg,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8, shadowColor: theme.colors.primary, shadowOpacity: 0.8, shadowRadius: 6 },
  hudLabel: {
    color: theme.colors.text,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: '600',
  },
  hudStatus: {
    color: theme.colors.primary,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '700',
    flexShrink: 1,
    marginRight: 8,
  },
  topMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  metaMono: {
    color: theme.colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },

  // paddingBottom lifts the reticle above the mode selector / scan controls
  reticleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 170 },
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
    fontFamily: mono,
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

  bottomWrap: { position: 'absolute', left: 0, right: 0, paddingBottom: 4 },
  tipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 14 },
  tipPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(0,0,0,0.45)',
    marginRight: 8,
  },
  tipPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tipText: {
    color: theme.colors.textDim,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: mono,
  },
  tipTextActive: {
    color: theme.colors.bg,
    fontWeight: '700',
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
    fontFamily: mono,
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
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 2,
  },
});
