import { useEffect, useState } from "react";
import {
  Image,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { localDate, messageOf, request } from "./api";
import { Button, ErrorMessage, Field, styles } from "./ui";
type Receipt = { uri: string; name: string; type: string };
export function AddLoan({
  token,
  onUnauthorized,
  onDone,
  onCancel,
}: {
  token: string;
  onUnauthorized: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy && !picking) onCancel();
      return true;
    });
    return () => listener.remove();
  }, [busy, picking, onCancel]);
  async function pick(camera: boolean) {
    if (picking || busy) return;
    setPicking(true);
    setError("");
    try {
      if (
        camera &&
        !(await ImagePicker.requestCameraPermissionsAsync()).granted
      ) {
        setError(
          "Camera access was denied. You can still choose a gallery photo.",
        );
        return;
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.85,
          });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setError("Choose a photo smaller than 5 MB.");
        return;
      }
      const photo = await ImageManipulator.manipulateAsync(asset.uri, [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setReceipt({ uri: photo.uri, name: "receipt.jpg", type: "image/jpeg" });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPicking(false);
    }
  }
  async function save() {
    if (busy || picking) return;
    const errors: Record<string, string> = {};
    if (!friendName.trim() || friendName.trim().length > 80)
      errors.friendName = "Enter a friend name (1–80 characters)";
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0)
      errors.amount = "Enter a positive amount with at most two decimal places";
    setFields(errors);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("friendName", friendName.trim());
    form.append("amount", amount.trim());
    form.append("dueDate", localDate(dueDate));
    if (receipt) form.append("receipt", receipt as unknown as Blob);
    try {
      await request("/loans", {
        method: "POST",
        body: form,
        token,
        onUnauthorized,
      });
      onDone();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Add an entry</Text>
        <Text style={styles.subtitle}>
          Record money you have lent. Past due dates are allowed.
        </Text>
        <Field
          label="Friend name"
          value={friendName}
          onChangeText={setFriendName}
          maxLength={80}
          editable={!busy}
          error={fields.friendName}
        />
        <Field
          label="Amount (₹)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="500.00"
          editable={!busy}
          error={fields.amount}
        />
        <View style={styles.field}>
          <Text style={styles.label}>Due date</Text>
          <Button
            title={localDate(dueDate)}
            onPress={() => setShowDate(true)}
            secondary
            disabled={busy}
          />
        </View>
        {showDate ? (
          <DateTimePicker
            value={dueDate}
            mode="date"
            minimumDate={new Date(1900, 0, 1)}
            onChange={(_, date) => {
              setShowDate(false);
              if (date) setDueDate(date);
            }}
          />
        ) : null}
        <View style={styles.card}>
          <Text style={styles.label}>Receipt photo (optional)</Text>
          <Text style={styles.subtitle}>JPEG or PNG, up to 5 MB.</Text>
          {receipt ? (
            <>
              <Image
                source={{ uri: receipt.uri }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel="Selected receipt"
              />
              <Button
                title="Remove photo"
                secondary
                disabled={busy || picking}
                onPress={() => setReceipt(null)}
              />
            </>
          ) : (
            <>
              <Button
                title="Choose from gallery"
                secondary
                disabled={busy || picking}
                onPress={() => {
                  void pick(false);
                }}
              />
              <Button
                title="Take a photo"
                secondary
                disabled={busy || picking}
                onPress={() => {
                  void pick(true);
                }}
              />
            </>
          )}
        </View>
        <ErrorMessage message={error} />
        <Button
          title="Save entry"
          busy={busy}
          disabled={picking}
          onPress={() => {
            void save();
          }}
        />
        <Button
          title="Cancel"
          secondary
          disabled={busy || picking}
          onPress={onCancel}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
