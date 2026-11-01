import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Row, IconButton, Text } from '../ui';
import { safeBack } from '../../navigation/safeBack';

/** Modal title bar: round white close button on the left and a centred title (like "Add New Task" in the reference). */
export function ModalHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <Row between>
      <IconButton icon="close" label="Close" solid onPress={() => safeBack(router)} />
      <Text variant="heading" fit accessibilityRole="header" numberOfLines={1} align="center" style={{ flex: 1 }}>{title}</Text>
      <View style={{ width: 52 }} />
    </Row>
  );
}
