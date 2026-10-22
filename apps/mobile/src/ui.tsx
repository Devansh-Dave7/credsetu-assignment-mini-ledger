import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
export function Button({
  title,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        styles.button,
        secondary && styles.secondary,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? "#174F45" : "#FFFFFF"} />
      ) : (
        <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#66756F"
        style={[styles.input, error ? styles.invalid : undefined]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  ) : null;
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F5F7F6" },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#163D34" },
  subtitle: { fontSize: 15, color: "#52645C", lineHeight: 22 },
  heading: { fontSize: 20, fontWeight: "700", color: "#163D34" },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFE6E2",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  summary: {
    backgroundColor: "#E8F1ED",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  label: { color: "#334E42", fontWeight: "600", fontSize: 15 },
  value: { fontSize: 18, color: "#163D34", fontWeight: "700" },
  field: { gap: 6 },
  input: {
    backgroundColor: "#FFFFFF",
    borderColor: "#A6B8AD",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 17,
    color: "#182B22",
    minHeight: 48,
  },
  invalid: { borderColor: "#A62B22" },
  error: { color: "#A62B22", fontSize: 14, lineHeight: 20 },
  button: {
    backgroundColor: "#1D6354",
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
  secondary: { backgroundColor: "#E6EEE9" },
  secondaryText: { color: "#174F45" },
  disabled: { opacity: 0.55 },
  overdue: { borderColor: "#C9642C", backgroundColor: "#FFF7F0" },
  status: { color: "#52645C", fontWeight: "700" },
  overdueText: { color: "#A34415" },
  image: { width: "100%", height: 180, borderRadius: 8 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
});
