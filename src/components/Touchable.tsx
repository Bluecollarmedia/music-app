import { useState, type ComponentRef, type Ref } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Extra style while the finger is down. */
  pressedStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ComponentRef<typeof Pressable>>;
};

/**
 * A Pressable with a plain (non-function) style.
 * Use it as the child of `<Link asChild>`: Link merges styles onto its child and
 * silently drops function styles, which collapses a row's layout.
 */
export function Touchable({ style, pressedStyle, onPressIn, onPressOut, ref, ...rest }: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={[style, pressed && pressedStyle]}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(e);
      }}
    />
  );
}
