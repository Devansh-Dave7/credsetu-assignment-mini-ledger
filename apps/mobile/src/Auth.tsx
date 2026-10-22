import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { request, messageOf, type User } from "./api";
import { Button, ErrorMessage, Field, styles } from "./ui";
export function Auth({
  onLogin,
}: {
  onLogin: (token: string, user: User) => Promise<void>;
}) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(
      () => setRemaining((v) => Math.max(0, v - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [remaining]);
  async function send() {
    if (busy) return;
    if (!/^(?:\+91)?[6-9]\d{9}$/.test(phone.replace(/[\s()-]/g, ""))) {
      setError("Enter a valid Indian mobile number");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/auth/request-otp", { method: "POST", body: { phone } });
      setStage("otp");
      setOtp("");
      setRemaining(60);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  async function verify() {
    if (busy) return;
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit OTP");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await request<{ token: string; user: User }>(
        "/auth/verify-otp",
        { method: "POST", body: { phone, otp } },
      );
      await onLogin(data.token, data.user);
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
        contentContainerStyle={[styles.content, { justifyContent: "center" }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>MiniLedger</Text>
        <Text style={styles.subtitle}>
          Keep track of money lent to friends.
        </Text>
        <View style={styles.card}>
          <Text style={styles.heading}>
            {stage === "phone" ? "Welcome" : "Verify your number"}
          </Text>
          {stage === "phone" ? (
            <Field
              label="Phone number"
              placeholder="9876543210"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={18}
              editable={!busy}
            />
          ) : (
            <>
              <Text style={styles.subtitle}>{phone}</Text>
              <Field
                label="OTP"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                editable={!busy}
                autoComplete="sms-otp"
              />
            </>
          )}
          <ErrorMessage message={error} />
          <Button
            title={stage === "phone" ? "Request OTP" : "Verify & log in"}
            onPress={() => {
              void (stage === "phone" ? send() : verify());
            }}
            busy={busy}
          />
          {stage === "otp" ? (
            <>
              <Button
                title={remaining ? `Resend in ${remaining}s` : "Resend OTP"}
                onPress={() => {
                  void send();
                }}
                secondary
                disabled={busy || remaining > 0}
              />
              <Button
                title="Change phone number"
                secondary
                disabled={busy}
                onPress={() => {
                  setStage("phone");
                  setError("");
                }}
              />
            </>
          ) : null}
        </View>
        <Text style={styles.subtitle}>
          Local assignment demo: the OTP is printed in the backend console. No
          SMS is sent. Codes expire after 5 minutes.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
