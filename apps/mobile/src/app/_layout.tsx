import { ActivityIndicator, Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../session";
import { Button, styles } from "../ui";
function Routes() {
  const { token, loading, error, restore, logout } = useSession();
  if (loading)
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text>Restoring your session…</Text>
      </View>
    );
  if (error)
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Button
          title="Retry connection"
          onPress={() => {
            void restore();
          }}
        />
        <Button title="Clear saved session" secondary onPress={logout} />
      </View>
    );
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={Boolean(token)}>
        <Stack.Screen name="add" options={{ gestureEnabled: false }} />
      </Stack.Protected>
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <SafeAreaView style={styles.page}>
          <StatusBar style="dark" />
          <Routes />
        </SafeAreaView>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
