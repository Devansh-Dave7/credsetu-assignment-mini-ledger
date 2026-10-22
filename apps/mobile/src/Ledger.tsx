import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Text,
  View,
  Image,
} from "react-native";
import {
  API_URL,
  messageOf,
  money,
  request,
  type Loan,
  type Summary,
} from "./api";
import { Button, ErrorMessage, styles } from "./ui";
export function Ledger({
  token,
  onUnauthorized,
  onAdd,
  onLogout,
  refreshVersion = 0,
}: {
  token: string;
  onUnauthorized: () => void;
  onAdd: () => void;
  onLogout: () => void;
  refreshVersion?: number;
}) {
  const [data, setData] = useState<{ loans: Loan[]; summary: Summary } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [repaying, setRepaying] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Loan | null>(null);
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const active = useRef(true);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const [entries, summary] = await Promise.all([
        request<{ loans: Loan[] }>("/loans", { token, onUnauthorized }),
        request<Summary>("/summary", { token, onUnauthorized }),
      ]);
      if (active.current) setData({ loans: entries.loans, summary });
    } catch (e) {
      if (active.current) setError(messageOf(e));
    } finally {
      inFlight.current = false;
      if (active.current) setLoading(false);
    }
  }, [token, onUnauthorized]);
  useEffect(() => {
    active.current = true;
    void load();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    let next = new Date();
    next.setUTCHours(18, 30, 0, 0);
    if (next.getTime() <= Date.now())
      next = new Date(next.getTime() + 86400000);
    let daily: ReturnType<typeof setInterval> | undefined;
    const midnight = setTimeout(
      () => {
        void load();
        daily = setInterval(() => {
          void load();
        }, 86400000);
      },
      next.getTime() - Date.now() + 1000,
    );
    return () => {
      active.current = false;
      subscription.remove();
      clearTimeout(midnight);
      if (daily) clearInterval(daily);
    };
  }, [load]);
  useEffect(() => {
    void load();
  }, [load, refreshVersion]);
  async function repay(loan: Loan) {
    if (repaying) return;
    setRepaying(loan.id);
    setError("");
    try {
      await request(`/loans/${loan.id}/repay`, {
        method: "PATCH",
        token,
        onUnauthorized,
      });
      await load();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setRepaying(null);
    }
  }
  return (
    <View style={styles.page}>
      <FlatList
        contentContainerStyle={styles.content}
        data={data?.loans ?? []}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => {
          void load();
        }}
        ListHeaderComponent={
          <View style={{ gap: 16 }}>
            <View style={styles.header}>
              <Text style={styles.title}>MiniLedger</Text>
              <Button title="Log out" secondary onPress={onLogout} />
            </View>
            <Text style={styles.subtitle}>Your money, clearly recorded.</Text>
            {data ? (
              <View style={styles.summary}>
                <Text style={styles.heading}>Summary</Text>
                {[
                  ["Total lent", data.summary.totalLent],
                  ["Total repaid", data.summary.totalRepaid],
                  ["Overdue amount", data.summary.overdueAmount],
                ].map(([label, amount]) => (
                  <View key={label} style={styles.row}>
                    <Text style={styles.label}>{label}</Text>
                    <Text style={styles.value}>{money(amount)}</Text>
                  </View>
                ))}
                <Text style={styles.subtitle}>
                  As of {data.summary.today} · India time
                </Text>
              </View>
            ) : null}
            <Button title="Add entry" onPress={onAdd} />
            <ErrorMessage message={error} />
            {error ? (
              <Button
                title="Retry"
                secondary
                onPress={() => {
                  void load();
                }}
              />
            ) : null}
            <Text style={styles.heading}>Entries</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator accessibilityLabel="Loading entries" />
          ) : !error ? (
            <Text style={styles.subtitle}>
              No entries yet. Add your first loan above.
            </Text>
          ) : undefined
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => (
          <View
            style={[styles.card, item.status === "OVERDUE" && styles.overdue]}
          >
            <View style={styles.row}>
              <Text style={[styles.heading, { flex: 1 }]}>
                {item.friendName}
              </Text>
              <Text style={styles.value}>{money(item.amount)}</Text>
            </View>
            <Text style={styles.subtitle}>Due {item.dueDate}</Text>
            <Text
              style={[
                styles.status,
                item.status === "OVERDUE" && styles.overdueText,
              ]}
            >
              {item.status === "REPAID"
                ? "Repaid"
                : item.status === "OVERDUE"
                  ? "Overdue"
                  : "Unpaid"}
            </Text>
            {item.hasReceipt ? (
              <Button
                title={`View receipt for ${item.friendName}`}
                secondary
                onPress={() => {
                  setImageState("loading");
                  setReceipt(item);
                }}
              />
            ) : null}
            {item.status !== "REPAID" ? (
              <Button
                title={`Mark ${item.friendName} repaid`}
                busy={repaying === item.id}
                disabled={Boolean(repaying) || loading}
                onPress={() =>
                  Alert.alert(
                    "Mark as repaid?",
                    `${item.friendName} has returned ${money(item.amount)}?`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Mark repaid",
                        onPress: () => {
                          void repay(item);
                        },
                      },
                    ],
                  )
                }
              />
            ) : null}
          </View>
        )}
      />
      <Modal
        visible={Boolean(receipt)}
        animationType="slide"
        onRequestClose={() => setReceipt(null)}
      >
        <View style={[styles.content, { flex: 1, paddingTop: 48 }]}>
          <Text style={styles.heading}>{receipt?.friendName} · receipt</Text>
          {receipt && imageState !== "error" ? (
            <Image
              style={{ flex: 1, width: "100%" }}
              resizeMode="contain"
              accessibilityLabel="Receipt photo"
              source={{
                uri: `${API_URL}/loans/${receipt.id}/receipt`,
                headers: { Authorization: `Bearer ${token}` },
              }}
              onLoad={() => setImageState("ready")}
              onError={() => {
                setImageState("error");
                void request("/auth/me", { token, onUnauthorized }).catch(
                  () => undefined,
                );
              }}
            />
          ) : null}
          {imageState === "loading" ? <ActivityIndicator /> : null}
          {imageState === "error" ? (
            <>
              <ErrorMessage message="The receipt could not be loaded. Check the API and retry." />
              <Button
                title="Retry image"
                onPress={() => setImageState("loading")}
              />
            </>
          ) : null}
          <Button title="Close receipt" onPress={() => setReceipt(null)} />
        </View>
      </Modal>
    </View>
  );
}
