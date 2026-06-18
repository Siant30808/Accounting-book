import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

// ─── 型別 ───────────────────────────────────────────────
interface SheetButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'cancel';
  flex?: number;
  disabled?: boolean;
}

interface AppBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  iconName?: React.ComponentProps<typeof Feather>['name'];
  iconColor?: string;
  /** 傳入後會顯示在標題右側（如「返回」按鈕） */
  headerRight?: React.ReactNode;
  /** 底部按鈕列表，使用 SheetButton 陣列 */
  buttons?: SheetButtonProps[];
  /** 自訂 footer（與 buttons 二擇一） */
  footer?: React.ReactNode;
  /** 副標題，顯示在標題下方 */
  subtitle?: string;
  /** 是否顯示 Android keyboard 避讓（預設 true） */
  avoidKeyboard?: boolean;
  children?: React.ReactNode;
  sheetStyle?: ViewStyle;
}

// ─── SheetButton（可獨立使用） ────────────────────────────
export function SheetButton({ label, onPress, variant = 'cancel', flex = 1, disabled }: SheetButtonProps) {
  const bg =
    variant === 'primary' ? 'rgba(139,92,246,0.92)' :
    variant === 'danger'  ? 'rgba(219,79,145,0.92)'  :
    '#F8FAFC';
  const color =
    variant === 'cancel' ? '#475569' : '#fff';

  return (
    <Pressable
      style={[sty.btn, { flex, backgroundColor: bg, borderWidth: variant === 'cancel' ? 1 : 0 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[sty.btnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

// ─── AppBottomSheet ───────────────────────────────────────
export default function AppBottomSheet({
  visible,
  onClose,
  title,
  iconName,
  iconColor = '#8B5CF6',
  headerRight,
  buttons,
  footer,
  subtitle,
  avoidKeyboard = true,
  children,
  sheetStyle,
}: AppBottomSheetProps) {
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!visible || !avoidKeyboard || Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', e => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [visible, avoidKeyboard]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const sheet = (
    <View style={[
      sty.sheet,
      sheetStyle,
      Platform.OS === 'android' && kbHeight > 0 && { marginBottom: kbHeight },
    ]}>
      <View style={sty.dragHandle} />

      {/* 標題列 */}
      <View style={sty.headerRow}>
        <View style={sty.titleGroup}>
          {iconName && <Feather name={iconName} size={20} color={iconColor} />}
          <Text style={sty.title}>{title}</Text>
        </View>
        {headerRight}
      </View>

      {/* 副標題 */}
      {subtitle ? <Text style={sty.subtitle}>{subtitle}</Text> : null}

      {/* 內容 */}
      {children}

      {/* Footer */}
      {footer ?? (buttons && buttons.length > 0 && (
        <View style={sty.footer}>
          {buttons.map((b, i) => (
            <SheetButton key={i} {...b} />
          ))}
        </View>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView
          behavior="padding"
          style={sty.kav}
          pointerEvents="box-none"
        >
          {sheet}
        </KeyboardAvoidingView>
      ) : (
        <View style={sty.kav} pointerEvents="box-none">
          {sheet}
        </View>
      )}
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────
const sty = StyleSheet.create({
  kav: {
    flex:           1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor:      'rgba(255,255,255,0.96)',
    borderTopLeftRadius:  32,
    borderTopRightRadius: 32,
    borderWidth:          1,
    borderColor:          'rgba(255,255,255,0.86)',
    paddingHorizontal:    20,
    paddingBottom:        Platform.OS === 'android' ? 28 : 20,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -8 },
    shadowOpacity:        0.10,
    shadowRadius:         22,
    elevation:            18,
  },
  dragHandle: {
    width:         40,
    height:        4,
    borderRadius:  2,
    backgroundColor: '#E2E8F0',
    alignSelf:     'center',
    marginTop:     12,
    marginBottom:  14,
  },
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   16,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  title: {
    fontSize:   20,
    fontWeight: '800',
    color:      '#1E293B',
  },
  subtitle: {
    fontSize:     14,
    color:        '#94A3B8',
    marginTop:    -8,
    marginBottom: 16,
  },
  footer: {
    flexDirection:  'row',
    gap:            12,
    paddingTop:     14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
    marginTop:      8,
  },
  btn: {
    paddingVertical: 14,
    borderRadius:    22,
    alignItems:      'center',
    borderColor:     'rgba(0,0,0,0.06)',
  },
  btnText: {
    fontSize:   16,
    fontWeight: '700',
  },
});
