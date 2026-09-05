import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const AnimatedPressableComponent = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ children, style, onPress, ...props }: PressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <AnimatedPressableComponent
      {...props}
      onPress={onPress}
      onPressIn={(e) => {
        scale.value = withSpring(0.97, { damping: 15, stiffness: 300, mass: 1 });
        if (props.onPressIn) props.onPressIn(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300, mass: 1 });
        if (props.onPressOut) props.onPressOut(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressableComponent>
  );
}