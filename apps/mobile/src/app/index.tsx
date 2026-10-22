import { router } from "expo-router";
import { Auth } from "../Auth";
import { Ledger } from "../Ledger";
import { useSession } from "../session";
export default function Home() {
  const { token, revision, login, logout } = useSession();
  return token ? (
    <Ledger
      token={token}
      refreshVersion={revision}
      onUnauthorized={logout}
      onAdd={() => router.push("/add")}
      onLogout={logout}
    />
  ) : (
    <Auth onLogin={login} />
  );
}
