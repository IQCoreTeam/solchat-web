import { test, expect } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomSidebar } from "../components/chat/room-sidebar";
const noop = () => {};
const props = {
  newRoomName: "",
  setNewRoomName: noop,
  newRoomGateEnabled: false,
  setNewRoomGateEnabled: noop,
  newRoomGateMint: "",
  setNewRoomGateMint: noop,
  newRoomGateAmount: "1",
  setNewRoomGateAmount: noop,
  newRoomGateType: 0,
  setNewRoomGateType: noop,
  creatingRoom: false,
  createRoomError: null,
  onCreateRoom: noop,
  rooms: [],
  selectedSeed: null,
  onSelectRoom: noop,
  rootStatus: "ready",
  rootError: null,
  roomsLoaded: true,
  onRetryRooms: noop,
  roomsLoading: false,
  roomsError: null,
  hasWallet: false,
  canWrite: false,
  isUserInitialized: false,
  isUserInitializing: false,
  userInitError: null,
  isSidebarOpen: true,
  onCloseSidebar: noop,
};
test("RPC failure shows retry and never claims there are no rooms", () => {
  const html = renderToStaticMarkup(
    createElement(RoomSidebar, {
      ...props,
      rootStatus: "error",
      rootError: "403 Forbidden",
    }),
  );
  expect(html).toContain("Couldn’t load rooms");
  expect(html).toContain("Retry loading rooms");
  expect(html).toContain("Change RPC");
  expect(html).not.toContain("No chat room exists");
  expect(html).not.toContain("403 Forbidden");
});
test("checking root and pending first list show loading, not empty", () => {
  for (const state of [{ rootStatus: "checking" }, { roomsLoaded: false }]) {
    const html = renderToStaticMarkup(
      createElement(RoomSidebar, { ...props, ...state }),
    );
    expect(html).toContain("Loading rooms");
    expect(html).not.toContain("No chat room exists");
  }
});
test("empty is shown only after a successful root and list read", () => {
  expect(renderToStaticMarkup(createElement(RoomSidebar, props))).toContain(
    "No chat room exists",
  );
});
test("list failure is not rendered as an empty room list", () => {
  const html = renderToStaticMarkup(
    createElement(RoomSidebar, {
      ...props,
      roomsError: "Failed to load rooms",
    }),
  );
  expect(html).not.toContain("No chat room exists");
  expect(html).toContain("Retry loading rooms");
});

test('create failure leaves the loaded room list usable without a read retry', () => {
  const html=renderToStaticMarkup(createElement(RoomSidebar,{...props,createRoomError:'Transaction simulation failed',rooms:[{name:'Existing room',seedHex:'abc',tableAddress:'synthetic-table'}]}));
  expect(html).toContain('Couldn’t create room');
  expect(html).toContain('Existing room');
  expect(html).not.toContain('Couldn’t load rooms');
  expect(html).not.toContain('Retry loading rooms');
});
