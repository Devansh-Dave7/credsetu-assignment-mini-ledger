import { router } from "expo-router";
import { AddLoan } from "../AddLoan";
import { useSession } from "../session";
export default function AddEntry() {
  const { token, logout, refreshLedger } = useSession();
  if (!token) return null;
  return (
    <AddLoan
      token={token}
      onUnauthorized={logout}
      onDone={() => {
        refreshLedger();
        router.back();
      }}
      onCancel={() => router.back()}
    />
  );
}
