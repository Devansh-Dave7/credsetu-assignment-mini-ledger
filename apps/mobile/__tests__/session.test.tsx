import { beforeEach, expect, jest, test } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Text, Pressable } from "react-native";
import * as SecureStore from "expo-secure-store";
import { request, RequestError } from "../src/api";
import { SessionProvider, useSession } from "../src/session";
jest.mock("../src/api", () => ({
  ...jest.requireActual<typeof import("../src/api")>("../src/api"),
  request: jest.fn(),
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
const api = request as jest.MockedFunction<
  (path: string, options?: unknown) => Promise<unknown>
>;
const storage = jest.mocked(SecureStore);
function Probe() {
  const { token, loading, error, login, logout } = useSession();
  return (
    <>
      <Text>{loading ? "Loading" : token ? "Logged in" : "Logged out"}</Text>
      <Text>{error}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Login"
        onPress={() => {
          void login("test-session", {
            id: "test-user",
            phone: "+919876543210",
          });
        }}
      >
        <Text>Login</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Logout"
        onPress={logout}
      >
        <Text>Logout</Text>
      </Pressable>
    </>
  );
}
beforeEach(() => {
  api.mockReset();
  storage.getItemAsync.mockReset();
  storage.setItemAsync.mockReset();
  storage.deleteItemAsync.mockReset();
  storage.setItemAsync.mockResolvedValue();
  storage.deleteItemAsync.mockResolvedValue();
});
test("stores login, restores after remount and clears on logout", async () => {
  let saved: string | null = null;
  storage.getItemAsync.mockImplementation(async () => saved);
  storage.setItemAsync.mockImplementation(async (_key, value) => {
    saved = value;
  });
  storage.deleteItemAsync.mockImplementation(async () => {
    saved = null;
  });
  api.mockResolvedValue({ user: { id: "test-user" } });
  const first = await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("Logged out");
  await fireEvent.press(screen.getByRole("button", { name: "Login" }));
  await screen.findByText("Logged in");
  await first.unmount();
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("Logged in");
  expect(api).toHaveBeenCalledWith("/auth/me", { token: "test-session" });
  await fireEvent.press(screen.getByRole("button", { name: "Logout" }));
  await screen.findByText("Logged out");
  await waitFor(() => expect(saved).toBeNull());
});
test("expired session returns to login and removes saved token", async () => {
  storage.getItemAsync.mockResolvedValue("expired-test-session");
  api.mockRejectedValue(new RequestError("Please log in again", 401));
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("Logged out");
  expect(storage.deleteItemAsync).toHaveBeenCalledWith("miniledger.session");
});
test("network failure preserves session and exposes a retryable error", async () => {
  storage.getItemAsync.mockResolvedValue("saved-test-session");
  api.mockRejectedValue(new RequestError("Cannot reach the API", 0));
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText("Cannot reach the API");
  expect(storage.deleteItemAsync).not.toHaveBeenCalled();
});
