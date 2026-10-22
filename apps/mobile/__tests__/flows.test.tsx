import { beforeEach, expect, jest, test } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert } from "react-native";
import { Auth } from "../src/Auth";
import { AddLoan } from "../src/AddLoan";
import { Ledger } from "../src/Ledger";
import { request } from "../src/api";
jest.mock("../src/api", () => ({
  ...jest.requireActual<typeof import("../src/api")>("../src/api"),
  request: jest.fn(),
}));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("@react-native-community/datetimepicker", () => "DateTimePicker");
const api = request as jest.MockedFunction<
  (path: string, options?: unknown) => Promise<unknown>
>;
const callbacks = () => ({
  onUnauthorized: jest.fn(),
  onAdd: jest.fn(),
  onLogout: jest.fn(),
});
beforeEach(() => {
  api.mockReset();
});
test("phone and OTP validation, request and login transition", async () => {
  const onLogin = jest
    .fn<(...args: unknown[]) => Promise<void>>()
    .mockResolvedValue(undefined);
  await render(<Auth onLogin={onLogin} />);
  await fireEvent.press(screen.getByText("Request OTP"));
  expect(screen.getByText("Enter a valid Indian mobile number")).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText("Phone number"),
    "9876543210",
  );
  api.mockResolvedValueOnce({ retryAfter: 60 });
  await fireEvent.press(screen.getByText("Request OTP"));
  await screen.findByText("Verify your number");
  await fireEvent.press(screen.getByText("Verify & log in"));
  expect(screen.getByText("Enter the six-digit OTP")).toBeTruthy();
  api.mockResolvedValueOnce({
    token: "sample",
    user: { id: "user", phone: "+919876543210" },
  });
  await fireEvent.changeText(screen.getByLabelText("OTP"), "123456");
  await fireEvent.press(screen.getByText("Verify & log in"));
  await waitFor(() =>
    expect(onLogin).toHaveBeenCalledWith("sample", {
      id: "user",
      phone: "+919876543210",
    }),
  );
});
test("incorrect OTP stays on login and displays the API error", async () => {
  await render(<Auth onLogin={async () => undefined} />);
  await fireEvent.changeText(
    screen.getByLabelText("Phone number"),
    "9876543210",
  );
  api.mockResolvedValueOnce({});
  await fireEvent.press(screen.getByText("Request OTP"));
  await screen.findByLabelText("OTP");
  api.mockRejectedValueOnce(new Error("Incorrect OTP"));
  await fireEvent.changeText(screen.getByLabelText("OTP"), "123456");
  await fireEvent.press(screen.getByText("Verify & log in"));
  expect(await screen.findByText("Incorrect OTP")).toBeTruthy();
});
test("validates entry and preserves fields after failed save", async () => {
  const onDone = jest.fn();
  await render(
    <AddLoan
      token="sample"
      onUnauthorized={jest.fn()}
      onDone={onDone}
      onCancel={jest.fn()}
    />,
  );
  await fireEvent.press(screen.getByText("Save entry"));
  expect(
    screen.getByText("Enter a friend name (1–80 characters)"),
  ).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Friend name"), "Rahul");
  await fireEvent.changeText(screen.getByLabelText("Amount (₹)"), "12.345");
  await fireEvent.press(screen.getByText("Save entry"));
  expect(api).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText("Amount (₹)"), "12.30");
  api.mockRejectedValueOnce(new Error("Connection failed"));
  await fireEvent.press(screen.getByText("Save entry"));
  await screen.findByText("Connection failed");
  expect(screen.getByLabelText("Friend name").props.value).toBe("Rahul");
  expect(screen.getByLabelText("Amount (₹)").props.value).toBe("12.30");
  expect(onDone).not.toHaveBeenCalled();
  api.mockResolvedValueOnce({});
  await fireEvent.press(screen.getByText("Save entry"));
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
});
test("renders empty ledger and zero totals", async () => {
  api.mockImplementation(async (path) =>
    path === "/loans"
      ? { loans: [] }
      : {
          totalLent: "0.00",
          totalRepaid: "0.00",
          overdueAmount: "0.00",
          today: "2026-10-22",
        },
  );
  await render(<Ledger token="sample" {...callbacks()} />);
  expect(
    await screen.findByText("No entries yet. Add your first loan above."),
  ).toBeTruthy();
  expect(await screen.findByText("Summary")).toBeTruthy();
});
test("list error offers retry and recovers", async () => {
  api.mockRejectedValue(new Error("API offline"));
  await render(<Ledger token="sample" {...callbacks()} />);
  await screen.findByText("API offline");
  api.mockImplementation(async (path) =>
    path === "/loans"
      ? { loans: [] }
      : {
          totalLent: "0.00",
          totalRepaid: "0.00",
          overdueAmount: "0.00",
          today: "2026-10-22",
        },
  );
  await fireEvent.press(screen.getByText("Retry"));
  expect(await screen.findByText("Summary")).toBeTruthy();
});
test("overdue label is visible and failed repayment does not change the entry", async () => {
  const loan = {
    id: "one",
    friendName: "Rahul",
    amount: "50.00",
    dueDate: "2026-10-21",
    status: "OVERDUE",
    hasReceipt: false,
  };
  api.mockImplementation(async (path) => {
    if (path.endsWith("/repay")) throw new Error("Could not save repayment");
    return path === "/loans"
      ? { loans: [loan] }
      : {
          totalLent: "50.00",
          totalRepaid: "0.00",
          overdueAmount: "50.00",
          today: "2026-10-22",
        };
  });
  const alert = jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      buttons?.[1]?.onPress?.();
    });
  await render(<Ledger token="sample" {...callbacks()} />);
  await screen.findByText("Overdue");
  await fireEvent.press(screen.getByText("Mark Rahul repaid"));
  await screen.findByText("Could not save repayment");
  expect(screen.getByText("Overdue")).toBeTruthy();
  alert.mockRestore();
});
